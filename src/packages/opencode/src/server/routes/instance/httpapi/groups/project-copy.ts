import { ProjectV2 } from "@opencode-ai/core/project"
import { SessionID } from "@/session/schema"
import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"

export const GenerateNamePayload = Schema.Struct({
  context: Schema.optional(Schema.String),
})

export class ApiWorkHandoffError extends Schema.ErrorClass<ApiWorkHandoffError>("WorkHandoffError")({
  name: Schema.Literal("WorkHandoffError"),
  data: Schema.Struct({ message: Schema.String }),
}, { httpApiStatus: 400 }) {}

export const ProjectCopyApi = HttpApi.make("projectCopyName").add(
  HttpApiGroup.make("projectCopyName")
    .add(
      HttpApiEndpoint.post("generateName", "/experimental/project/:projectID/copy/generate-name", {
        params: { projectID: ProjectV2.ID },
        query: WorkspaceRoutingQuery,
        payload: GenerateNamePayload,
        success: Schema.Struct({ name: Schema.String }),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "experimental.projectCopy.generateName",
          summary: "Generate project copy name",
          description: "Generate a short name for a project copy from task context.",
        }),
      ),
    )
    .add(HttpApiEndpoint.post("work", "/experimental/session/:sessionID/work", {
      params: { sessionID: SessionID }, query: WorkspaceRoutingQuery,
      payload: Schema.Struct({ name: Schema.String }), success: Schema.Struct({ directory: Schema.String }), error: ApiWorkHandoffError,
    }).annotateMerge(OpenApi.annotations({ identifier: "experimental.projectCopy.work", summary: "Start isolated work" })))
    .add(HttpApiEndpoint.post("done", "/experimental/session/:sessionID/done", {
      params: { sessionID: SessionID }, query: WorkspaceRoutingQuery,
      success: Schema.Struct({ queued: Schema.Boolean }), error: ApiWorkHandoffError,
    }).annotateMerge(OpenApi.annotations({ identifier: "experimental.projectCopy.done", summary: "Queue work completion" })))
    .annotateMerge(OpenApi.annotations({ title: "projectCopy", description: "Project copy naming routes." }))
    .middleware(InstanceContextMiddleware)
    .middleware(WorkspaceRoutingMiddleware)
    .middleware(Authorization),
)
