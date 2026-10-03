import { OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv, OptionalAuthenticatedApiEnv } from "../../http/authenticated-actor";
import { registerChangeUsernameRoute, type ChangeUsernameRouteDependencies } from "./change-username/change-username.route";
import { registerGetProfileDetailsRoute, type GetProfileDetailsRouteDependencies } from "./get-profile-details/get-profile-details.route";
import { registerGetAvatarRoute, type GetAvatarRouteDependencies } from "./get-avatar/get-avatar.route";
import { registerRemoveAvatarRoute, type RemoveAvatarRouteDependencies } from "./remove-avatar/remove-avatar.route";
import { registerSetAvatarRoute, type SetAvatarRouteDependencies } from "./set-avatar/set-avatar.route";
import { registerUpdateProfileRoute, type UpdateProfileRouteDependencies } from "./update-profile/update-profile.route";
import { registerUsernameProfileRoutes, type UsernameProfileRouteDependencies } from "./username/username.route";

export interface ProfilesRouteDependencies {
  username: UsernameProfileRouteDependencies;
  details: GetProfileDetailsRouteDependencies;
  avatar: GetAvatarRouteDependencies;
  update: UpdateProfileRouteDependencies;
  changeUsername: ChangeUsernameRouteDependencies;
  setAvatar: SetAvatarRouteDependencies;
  removeAvatar: RemoveAvatarRouteDependencies;
}

/** Register profile actions without embedding profile policy in the composition root. */
export function registerProfilesRoutes(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: ProfilesRouteDependencies) {
  registerUsernameProfileRoutes(app, dependencies.username);
  registerChangeUsernameRoute(app, dependencies.changeUsername);
  const publicProfileReads = new OpenAPIHono<OptionalAuthenticatedApiEnv>();
  registerGetProfileDetailsRoute(publicProfileReads, dependencies.details);
  registerGetAvatarRoute(publicProfileReads, dependencies.avatar);
  app.route("/", publicProfileReads);
  registerUpdateProfileRoute(app, dependencies.update);
  registerSetAvatarRoute(app, dependencies.setAvatar);
  registerRemoveAvatarRoute(app, dependencies.removeAvatar);
}
