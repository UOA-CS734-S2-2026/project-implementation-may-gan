import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../http/authenticated-actor";
import { registerChangeUsernameRoute, type ChangeUsernameRouteDependencies } from "./change-username/change-username.route";
import { registerGetMoodHistoryRoute, type GetMoodHistoryRouteDependencies } from "./get-mood-history/get-mood-history.route";
import { registerGetProfileDetailsRoute, type GetProfileDetailsRouteDependencies } from "./get-profile-details/get-profile-details.route";
import { registerRemoveAvatarRoute, type RemoveAvatarRouteDependencies } from "./remove-avatar/remove-avatar.route";
import { registerSetAvatarRoute, type SetAvatarRouteDependencies } from "./set-avatar/set-avatar.route";
import { registerUpdateProfileRoute, type UpdateProfileRouteDependencies } from "./update-profile/update-profile.route";
import { registerUsernameProfileRoutes, type UsernameProfileRouteDependencies } from "./username/username.route";

export interface ProfilesRouteDependencies {
  username: UsernameProfileRouteDependencies;
  details: GetProfileDetailsRouteDependencies;
  update: UpdateProfileRouteDependencies;
  changeUsername: ChangeUsernameRouteDependencies;
  setAvatar: SetAvatarRouteDependencies;
  removeAvatar: RemoveAvatarRouteDependencies;
  moodHistory: GetMoodHistoryRouteDependencies;
}

/** Register profile actions without embedding profile policy in the composition root. */
export function registerProfilesRoutes(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: ProfilesRouteDependencies) {
  registerUsernameProfileRoutes(app, dependencies.username);
  registerChangeUsernameRoute(app, dependencies.changeUsername);
  registerGetProfileDetailsRoute(app, dependencies.details);
  registerUpdateProfileRoute(app, dependencies.update);
  registerSetAvatarRoute(app, dependencies.setAvatar);
  registerRemoveAvatarRoute(app, dependencies.removeAvatar);
  registerGetMoodHistoryRoute(app, dependencies.moodHistory);
}
