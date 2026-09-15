#include <windows.h>
#include <shellapi.h>
#include <stdint.h>
#include <algorithm>
#include <cstring>
#include <string>
#include <vector>

namespace {
constexpr uint16_t version = 1;
constexpr uint16_t request = 1;
constexpr uint16_t cancel = 2;
constexpr uint16_t ready = 3;
constexpr uint16_t root_exit = 4;
constexpr uint16_t job_empty = 5;
constexpr uint16_t failure = 6;

struct Message {
  uint16_t type;
  std::vector<uint8_t> body;
};

struct Descriptor {
  int fd;
  bool input;
  HANDLE handle;
};

constexpr unsigned char crt_open = 0x01;
constexpr unsigned char crt_pipe = 0x08;
constexpr unsigned char crt_device = 0x40;

bool receive(HANDLE pipe, Message& message);

bool read_exact(HANDLE pipe, void* data, DWORD size) {
  auto* bytes = static_cast<uint8_t*>(data);
  while (size != 0) {
    DWORD read = 0;
    if (!ReadFile(pipe, bytes, size, &read, nullptr) || read == 0) return false;
    bytes += read;
    size -= read;
  }
  return true;
}

bool write_exact(HANDLE pipe, const void* data, DWORD size) {
  auto* bytes = static_cast<const uint8_t*>(data);
  while (size != 0) {
    DWORD written = 0;
    if (!WriteFile(pipe, bytes, size, &written, nullptr) || written == 0) return false;
    bytes += written;
    size -= written;
  }
  return true;
}

bool wait_for_job_empty(HANDLE job, HANDLE completion, HANDLE pipe) {
  for (;;) {
    JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting{};
    if (QueryInformationJobObject(job, JobObjectBasicAccountingInformation, &accounting, sizeof(accounting), nullptr) &&
        accounting.ActiveProcesses == 0) return true;
    DWORD message = 0;
    ULONG_PTR key = 0;
    OVERLAPPED* overlapped = nullptr;
    const BOOL received = GetQueuedCompletionStatus(completion, &message, &key, &overlapped, 50);
    if (received && message == JOB_OBJECT_MSG_ACTIVE_PROCESS_ZERO) return true;
    DWORD available = 0;
    if (!PeekNamedPipe(pipe, nullptr, 0, nullptr, &available, nullptr)) {
      TerminateJobObject(job, 1);
      continue;
    }
    if (available != 0) {
      Message control;
      if (receive(pipe, control) && control.type == cancel) TerminateJobObject(job, 1);
    }
  }
}

bool receive(HANDLE pipe, Message& message) {
  uint8_t header[8];
  if (!read_exact(pipe, header, sizeof(header))) return false;
  const auto read16 = [&](int offset) { return static_cast<uint16_t>(header[offset] | (header[offset + 1] << 8)); };
  const auto read32 = [&](int offset) { return static_cast<uint32_t>(header[offset] | (header[offset + 1] << 8) | (header[offset + 2] << 16) | (header[offset + 3] << 24)); };
  if (read16(0) != version || read32(4) > 16 * 1024 * 1024) return false;
  message.type = read16(2);
  message.body.resize(read32(4));
  return message.body.empty() || read_exact(pipe, message.body.data(), static_cast<DWORD>(message.body.size()));
}

bool send(HANDLE pipe, uint16_t type, const void* data, uint32_t size) {
  uint8_t header[8] = { static_cast<uint8_t>(version), 0, static_cast<uint8_t>(type), 0,
                        static_cast<uint8_t>(size), static_cast<uint8_t>(size >> 8),
                        static_cast<uint8_t>(size >> 16), static_cast<uint8_t>(size >> 24) };
  return write_exact(pipe, header, sizeof(header)) && (size == 0 || write_exact(pipe, data, size));
}

bool string_field(const std::vector<uint8_t>& body, size_t& offset, std::wstring& value) {
  if (offset + 4 > body.size()) return false;
  const uint32_t size = body[offset] | (body[offset + 1] << 8) | (body[offset + 2] << 16) | (body[offset + 3] << 24);
  offset += 4;
  if (size > body.size() - offset) return false;
  int chars = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, reinterpret_cast<const char*>(body.data() + offset), size, nullptr, 0);
  if (chars <= 0 && size != 0) return false;
  value.resize(chars);
  if (chars != 0 && MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, reinterpret_cast<const char*>(body.data() + offset), size, value.data(), chars) != chars) return false;
  offset += size;
  return true;
}

void fail(HANDLE pipe, const char* reason) {
  send(pipe, failure, reason, static_cast<uint32_t>(strlen(reason)));
}

bool connect_descriptor(const std::wstring& name, HANDLE& handle) {
  handle = CreateFileW(name.c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_EXISTING, 0, nullptr);
  return handle != INVALID_HANDLE_VALUE;
}

void close_descriptors(const std::vector<Descriptor>& descriptors) {
  for (const Descriptor& descriptor : descriptors) CloseHandle(descriptor.handle);
}
}

int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR command_line, int) {
  // Bun may spawn this GUI helper with CREATE_NO_WINDOW, which attaches a dummy
  // console. Detach that dummy console. Reuse the parent terminal when present.
  // Never AllocConsole: that window is what users see as "cmd" on glob/Escape.
  FreeConsole();
  const bool attached = AttachConsole(ATTACH_PARENT_PROCESS) != 0;
  int argc = 0;
  LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
  if (!argv) return 2;
  if (argc == 2 && wcscmp(argv[1], L"--version") == 0) {
    constexpr char text[] = "opencode-process-tree protocol 1\r\n";
    DWORD written = 0;
    WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), text, sizeof(text) - 1, &written, nullptr);
    LocalFree(argv);
    return 0;
  }
  if (argc != 3 || wcscmp(argv[1], L"--control") != 0) { LocalFree(argv); return 2; }
  HANDLE pipe = CreateFileW(argv[2], GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_EXISTING, 0, nullptr);
  LocalFree(argv);
  if (pipe == INVALID_HANDLE_VALUE) return 3;

  Message message;
  if (!receive(pipe, message) || message.type != request) { fail(pipe, "malformed request"); CloseHandle(pipe); return 4; }
  size_t offset = 0;
  std::wstring executable, command, cwd, shell, environment, descriptor_text;
  if (!string_field(message.body, offset, executable) || !string_field(message.body, offset, command) ||
      !string_field(message.body, offset, cwd) || !string_field(message.body, offset, shell) ||
      !string_field(message.body, offset, environment) || !string_field(message.body, offset, descriptor_text)) {
    fail(pipe, "malformed request fields"); CloseHandle(pipe); return 4;
  }

  std::vector<Descriptor> descriptors;
  size_t descriptor_offset = 0;
  while (descriptor_offset < descriptor_text.size()) {
    const size_t end = descriptor_text.find(L'\n', descriptor_offset);
    const std::wstring record = descriptor_text.substr(descriptor_offset, end == std::wstring::npos ? end : end - descriptor_offset);
    if (!record.empty()) {
      const size_t first = record.find(L'|');
      if (first == std::wstring::npos) { fail(pipe, "malformed descriptor"); close_descriptors(descriptors); CloseHandle(pipe); return 4; }
      const size_t second = record.find(L'|', first + 1);
      if (second == std::wstring::npos) { fail(pipe, "malformed descriptor"); close_descriptors(descriptors); CloseHandle(pipe); return 4; }
      int fd = 0;
      for (size_t index = 0; index < first; index++) {
        if (record[index] < L'0' || record[index] > L'9' || fd > 7000) { fail(pipe, "unsupported descriptor index"); close_descriptors(descriptors); CloseHandle(pipe); return 4; }
        fd = fd * 10 + static_cast<int>(record[index] - L'0');
      }
      if (fd < 3) { fail(pipe, "invalid additional descriptor index"); close_descriptors(descriptors); CloseHandle(pipe); return 4; }
      HANDLE descriptor = INVALID_HANDLE_VALUE;
      if (!connect_descriptor(record.substr(second + 1), descriptor)) { fail(pipe, "descriptor connection failed"); close_descriptors(descriptors); CloseHandle(pipe); return 5; }
      SetHandleInformation(descriptor, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT);
      descriptors.push_back({ fd, record.substr(first + 1, second - first - 1) == L"input", descriptor });
    }
    if (end == std::wstring::npos) break;
    descriptor_offset = end + 1;
  }

  HANDLE job = CreateJobObjectW(nullptr, nullptr);
  if (!job) { fail(pipe, "job creation failed"); close_descriptors(descriptors); CloseHandle(pipe); return 5; }
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
  limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
  if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) {
    fail(pipe, "job configuration failed"); close_descriptors(descriptors); CloseHandle(job); CloseHandle(pipe); return 5;
  }
  HANDLE completion = CreateIoCompletionPort(INVALID_HANDLE_VALUE, nullptr, 0, 1);
  JOBOBJECT_ASSOCIATE_COMPLETION_PORT association{ job, completion };
  if (!completion || !SetInformationJobObject(job, JobObjectAssociateCompletionPortInformation, &association, sizeof(association))) {
    fail(pipe, "job notification setup failed");
    if (completion) CloseHandle(completion);
    close_descriptors(descriptors);
    CloseHandle(job); CloseHandle(pipe); return 5;
  }

  STARTUPINFOEXW startup{};
  startup.StartupInfo.cb = sizeof(startup);
  startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
  startup.StartupInfo.wShowWindow = SW_HIDE;
  startup.StartupInfo.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
  startup.StartupInfo.hStdOutput = GetStdHandle(STD_OUTPUT_HANDLE);
  startup.StartupInfo.hStdError = GetStdHandle(STD_ERROR_HANDLE);
  std::vector<HANDLE> inherited = { startup.StartupInfo.hStdInput, startup.StartupInfo.hStdOutput, startup.StartupInfo.hStdError };
  std::vector<uint8_t> crt_block;
  if (!descriptors.empty()) {
    int max_fd = 2;
    for (const Descriptor& descriptor : descriptors) max_fd = (std::max)(max_fd, descriptor.fd);
    if (max_fd > 254) {
      fail(pipe, "descriptor index is too large");
      close_descriptors(descriptors);
      CloseHandle(job); CloseHandle(pipe); return 4;
    }
    std::vector<HANDLE> crt_handles(max_fd + 1, INVALID_HANDLE_VALUE);
    std::vector<unsigned char> crt_flags(max_fd + 1, 0);
    crt_handles[0] = startup.StartupInfo.hStdInput;
    crt_handles[1] = startup.StartupInfo.hStdOutput;
    crt_handles[2] = startup.StartupInfo.hStdError;
    for (int fd = 0; fd <= 2; fd++) {
      if (crt_handles[fd] == nullptr || crt_handles[fd] == INVALID_HANDLE_VALUE) continue;
      SetHandleInformation(crt_handles[fd], HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT);
      crt_flags[fd] = crt_open | (GetFileType(crt_handles[fd]) == FILE_TYPE_PIPE ? crt_pipe : crt_device);
    }
    for (const Descriptor& descriptor : descriptors) {
      crt_handles[descriptor.fd] = descriptor.handle;
      crt_flags[descriptor.fd] = crt_open | crt_pipe;
    }
    const int crt_count = static_cast<int>(crt_handles.size());
    const size_t crt_size = sizeof(crt_count) + crt_flags.size() + crt_handles.size() * sizeof(uintptr_t);
    crt_block.resize(crt_size);
    memcpy(crt_block.data(), &crt_count, sizeof(crt_count));
    memcpy(crt_block.data() + sizeof(crt_count), crt_flags.data(), crt_flags.size());
    memcpy(crt_block.data() + sizeof(crt_count) + crt_flags.size(), crt_handles.data(), crt_handles.size() * sizeof(uintptr_t));
    startup.StartupInfo.cbReserved2 = static_cast<WORD>(crt_block.size());
    startup.StartupInfo.lpReserved2 = crt_block.data();
    inherited.insert(inherited.end(), crt_handles.begin() + 3, crt_handles.end());
  }
  inherited.erase(std::remove_if(inherited.begin(), inherited.end(), [](HANDLE handle) {
    return handle == nullptr || handle == INVALID_HANDLE_VALUE;
  }), inherited.end());
  SIZE_T attributes_size = 0;
  InitializeProcThreadAttributeList(nullptr, 1, 0, &attributes_size);
  startup.lpAttributeList = static_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(HeapAlloc(GetProcessHeap(), 0, attributes_size));
  if (!startup.lpAttributeList || !InitializeProcThreadAttributeList(startup.lpAttributeList, 1, 0, &attributes_size) ||
      !UpdateProcThreadAttribute(startup.lpAttributeList, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST, inherited.data(), inherited.size() * sizeof(HANDLE), nullptr, nullptr)) {
    fail(pipe, "inherited-handle setup failed");
    if (startup.lpAttributeList) DeleteProcThreadAttributeList(startup.lpAttributeList);
    HeapFree(GetProcessHeap(), 0, startup.lpAttributeList); CloseHandle(completion); close_descriptors(descriptors); CloseHandle(job); CloseHandle(pipe); return 5;
  }

  std::vector<wchar_t> mutable_command(command.begin(), command.end());
  mutable_command.push_back(L'\0');
  std::vector<wchar_t> environment_block(environment.begin(), environment.end());
  if (environment_block.empty() || environment_block.back() != L'\0') environment_block.push_back(L'\0');
  PROCESS_INFORMATION process{};
  DWORD flags = CREATE_SUSPENDED | EXTENDED_STARTUPINFO_PRESENT | CREATE_UNICODE_ENVIRONMENT;
  // MSVC tools (rg) stay silent with CREATE_NO_WINDOW. Only inherit a real parent
  // console, so Git/MSYS does not allocate a visible ForceV1 conhost.
  if (!attached) flags |= CREATE_NO_WINDOW;
  if (!CreateProcessW(executable.c_str(), mutable_command.data(), nullptr, nullptr, TRUE, flags,
                      environment_block.size() > 1 ? environment_block.data() : nullptr,
                      cwd.empty() ? nullptr : cwd.c_str(), &startup.StartupInfo, &process)) {
    fail(pipe, "root creation failed"); DeleteProcThreadAttributeList(startup.lpAttributeList); HeapFree(GetProcessHeap(), 0, startup.lpAttributeList); CloseHandle(completion); close_descriptors(descriptors); CloseHandle(job); CloseHandle(pipe); return 6;
  }
  DeleteProcThreadAttributeList(startup.lpAttributeList);
  HeapFree(GetProcessHeap(), 0, startup.lpAttributeList);
  if (!AssignProcessToJobObject(job, process.hProcess)) {
    fail(pipe, "job assignment failed"); TerminateProcess(process.hProcess, 1); CloseHandle(process.hThread); CloseHandle(process.hProcess); CloseHandle(completion); close_descriptors(descriptors); CloseHandle(job); CloseHandle(pipe); return 7;
  }
  if (ResumeThread(process.hThread) == static_cast<DWORD>(-1)) {
    fail(pipe, "root resume failed");
    TerminateJobObject(job, 1);
    CloseHandle(process.hThread); CloseHandle(process.hProcess); CloseHandle(completion); close_descriptors(descriptors); CloseHandle(job); CloseHandle(pipe);
    return 8;
  }
  const uint32_t pid = process.dwProcessId;
  if (!send(pipe, ready, &pid, sizeof(pid))) { CloseHandle(process.hThread); CloseHandle(process.hProcess); CloseHandle(job); CloseHandle(pipe); return 8; }

  bool root_done = false;
  for (;;) {
    if (WaitForSingleObject(process.hProcess, 50) == WAIT_OBJECT_0) {
      DWORD exit_code = 1;
      GetExitCodeProcess(process.hProcess, &exit_code);
      send(pipe, root_exit, &exit_code, sizeof(exit_code));
      wait_for_job_empty(job, completion, pipe);
      send(pipe, job_empty, nullptr, 0);
      root_done = true;
      break;
    }
    DWORD available = 0;
    if (!PeekNamedPipe(pipe, nullptr, 0, nullptr, &available, nullptr)) {
      TerminateJobObject(job, 1);
      break;
    }
    if (available != 0) {
      Message control;
      if (receive(pipe, control) && control.type == cancel) {
        TerminateJobObject(job, 1);
        DWORD exit_code = 1;
        WaitForSingleObject(process.hProcess, INFINITE);
        GetExitCodeProcess(process.hProcess, &exit_code);
        send(pipe, root_exit, &exit_code, sizeof(exit_code));
        wait_for_job_empty(job, completion, pipe);
        send(pipe, job_empty, nullptr, 0);
      }
      break;
    }
  }
  if (!root_done) TerminateJobObject(job, 1);
  CloseHandle(process.hThread);
  CloseHandle(process.hProcess);
  close_descriptors(descriptors);
  CloseHandle(job);
  CloseHandle(completion);
  CloseHandle(pipe);
  return 0;
}
