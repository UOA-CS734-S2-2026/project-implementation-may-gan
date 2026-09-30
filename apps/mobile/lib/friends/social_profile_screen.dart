import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_failure.dart';
import '../api/friends_client.dart';
import '../api/profile_client.dart';
import '../app/app_scope.dart';
import '../auth/session_controller.dart';
import '../app/theme.dart';
import '../profile/profile_posts.dart';
import '../profile/profile_stats.dart';
import '../ui/dayli_button.dart';
import '../ui/surfaces.dart';

/// Account-scoped, WDCC-inspired minimal profile. It never exposes provider data or invented profile fields.
class SocialProfileScreen extends StatefulWidget {
  const SocialProfileScreen({
    super.key,
    required this.username,
    this.followRenames = true,
  });
  final String username;

  /// Moves to `/u/<current handle>` when [username] is one its owner has
  /// since changed. My days shows the signed-in user's own profile in place.
  final bool followRenames;
  @override
  State<SocialProfileScreen> createState() => _SocialProfileScreenState();
}

/// The relationship card and the profile details, read together.
typedef _LoadedProfile = (FriendCard, ProfileDetails);

class _SocialProfileScreenState extends State<SocialProfileScreen> {
  Future<ApiResult<_LoadedProfile>>? _profile;
  String? _accountId;
  String? _loadedUsername;
  SessionController? _session;
  bool _busy = false;
  String? _notice;
  String? _authorizedProfileId;

  /// Posts for the profile on screen, for the account that loaded them.
  ProfilePostsController? _posts;
  (String?, String)? _postsFor;

  /// Details first: they resolve a handle the owner has since changed, and the
  /// relationship card is then read for the current one.
  Future<ApiResult<_LoadedProfile>> _load() async {
    final services = AppScope.of(context);
    final details = await services.profiles.details(widget.username);
    switch (details) {
      case ApiError(:final failure):
        return ApiError(failure);
      case ApiSuccess(value: final profile):
        final card = await services.friends.profile(profile.username);
        return switch (card) {
          ApiSuccess(value: final person) => ApiSuccess((person, profile)),
          ApiError(:final failure) => ApiError(failure),
        };
    }
  }

  void _followRename(ProfileDetails profile) {
    if (profile.username.toLowerCase() == widget.username.toLowerCase()) {
      return;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      // Another device changed this account's handle.
      if (profile.isOwner) {
        AppScope.of(context).session.usernameChanged(profile.username);
      }
      if (widget.followRenames) {
        context.go('/u/${Uri.encodeComponent(profile.username)}');
      }
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final session = AppScope.of(context).session;
    if (_session != session) {
      _session?.removeListener(_onSessionChanged);
      _session = session;
      _session!.addListener(_onSessionChanged);
    }
    _syncActor();
  }

  @override
  void didUpdateWidget(covariant SocialProfileScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.username != widget.username) _syncActor();
  }

  void _onSessionChanged() {
    if (!mounted) return;
    _syncActor();
    setState(() {});
  }

  void _syncActor() {
    final accountId = _session?.user?.id;
    if (_profile == null ||
        _accountId != accountId ||
        _loadedUsername != widget.username) {
      _accountId = accountId;
      _loadedUsername = widget.username;
      _notice = null;
      _authorizedProfileId = null;
      _profile = _load();
    }
  }

  @override
  void dispose() {
    _session?.removeListener(_onSessionChanged);
    _posts?.dispose();
    super.dispose();
  }

  /// Keeps one posts list per account and profile, and none once the viewer
  /// may no longer see posts, such as after removing the friend.
  ProfilePostsController? _postsController(
    FriendCard person,
    bool canSeePosts,
  ) {
    final owner = (_accountId, person.username);
    if (!canSeePosts || _postsFor != owner) {
      final stale = _posts;
      _posts = null;
      _postsFor = null;
      // The old list may still be listened to until this frame rebuilds.
      if (stale != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) => stale.dispose());
      }
    }
    if (canSeePosts && _posts == null) {
      _postsFor = owner;
      _posts = ProfilePostsController(
        AppScope.of(context).posts,
        person.username,
      )..refresh();
    }
    return _posts;
  }

  Future<void> _refresh() async {
    setState(() {
      _profile = _load();
    });
    await Future.wait([?_profile, ?_posts?.refresh()]);
  }

  @override
  Widget build(BuildContext context) {
    _syncActor();
    return FutureBuilder<ApiResult<_LoadedProfile>>(
      key: ValueKey((_accountId, widget.username)),
      future: _profile,
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.data case ApiSuccess(value: (final person, final info))) {
          _authorizedProfileId = person.id;
          _followRename(info);
          return _profileCard(context, person, info);
        }
        return Center(
          child: DayliCard(
            padding: const EdgeInsets.all(24),
            child: Text(
              'This profile is unavailable.',
              style: DayliText.serif(context),
            ),
          ),
        );
      },
    );
  }

  Future<void> _friend(FriendCard person) async {
    _syncActor();
    final accountAtStart = _accountId;
    if (_busy ||
        accountAtStart == person.id ||
        accountAtStart != _session?.user?.id ||
        _authorizedProfileId != person.id) {
      return;
    }
    setState(() {
      _busy = true;
      _notice = null;
    });
    final client = AppScope.of(context).friends;
    final result = person.relationship == 'none'
        ? await client.send(person.id)
        : person.relationship == 'friends'
        ? await client.remove(person.id)
        : const ApiSuccess<void>(null);
    if (!mounted || accountAtStart != _session?.user?.id) return;
    setState(() {
      _busy = false;
      _notice = result is ApiError<void>
          ? 'That action is unavailable. Please try again.'
          : null;
      _profile = _load();
    });
  }

  Future<void> _edit() async {
    await context.push('/profile/edit');
    if (mounted) await _refresh();
  }

  Widget _profileCard(
    BuildContext context,
    FriendCard person,
    ProfileDetails info,
  ) {
    final colors = DayliColors.of(context);
    final isMe = person.id == _session?.user?.id;
    final posts = _postsController(
      person,
      isMe || person.relationship == 'friends',
    );
    final label = person.relationship == 'none'
        ? 'add friend'
        : person.relationship == 'friends'
        ? 'remove friend'
        : person.relationship == 'incoming_pending'
        ? 'request waiting'
        : 'request sent';
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 36, 20, 32),
        children: [
          DayliCard(
            padding: const EdgeInsets.all(28),
            radius: 22,
            child: Column(
              children: [
                CircleAvatar(
                  radius: 56,
                  backgroundColor: colors.backgroundAccent,
                  child: Text(
                    person.displayName.substring(0, 1).toUpperCase(),
                    style: DayliText.serif(
                      context,
                      size: DayliTextSize.xxxxl,
                      color: colors.foregroundAccent,
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  '@${person.username}',
                  style: DayliText.sans(
                    context,
                    size: DayliTextSize.sm,
                    color: colors.foregroundTertiary,
                  ),
                ),
                Text(
                  person.displayName,
                  style: DayliText.serif(
                    context,
                    size: DayliTextSize.xxl,
                    weight: FontWeight.w600,
                    tracking: DayliTracking.tighter,
                  ),
                ),
                if (!info.detailsVisible) ...[
                  const SizedBox(height: 10),
                  Text(
                    "${person.displayName}'s profile is private.",
                    key: const Key('profile.private'),
                    textAlign: TextAlign.center,
                    style: DayliText.sans(
                      context,
                      size: DayliTextSize.sm,
                      color: colors.foregroundTertiary,
                    ),
                  ),
                ] else if (info.bio case final bio?) ...[
                  const SizedBox(height: 10),
                  Text(
                    bio,
                    key: const Key('profile.bio'),
                    textAlign: TextAlign.center,
                    style: DayliText.serif(
                      context,
                      size: DayliTextSize.lg,
                      tracking: DayliTracking.tight,
                    ),
                  ),
                ],
                if ((info.stats, info.streak) case (
                  final stats?,
                  final streak?,
                ))
                  ProfileStatsTile(
                    stats: stats,
                    streak: streak,
                    onFriends: isMe ? () => context.go('/friends') : null,
                  ),
                const SizedBox(height: 22),
                if (isMe)
                  SizedBox(
                    width: double.infinity,
                    child: DayliButton(
                      key: const Key('profile.edit'),
                      label: 'edit profile',
                      color: ButtonColor.foreground,
                      onPressed: _edit,
                    ),
                  ),
                if (!isMe &&
                    (person.relationship == 'none' ||
                        person.relationship == 'friends'))
                  SizedBox(
                    width: double.infinity,
                    child: DayliButton(
                      label: label,
                      onPressed: _busy ? null : () => _friend(person),
                    ),
                  )
                else if (!isMe)
                  Text(
                    label,
                    style: DayliText.sans(
                      context,
                      size: DayliTextSize.sm,
                      color: colors.foregroundSecondary,
                    ),
                  ),
                if (!isMe) ...[
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: DayliButton(
                      label: 'message',
                      color: ButtonColor.foreground,
                      onPressed: () => context.go(
                        '/messages/new/${Uri.encodeComponent(person.username)}',
                      ),
                    ),
                  ),
                ],
                if (_notice != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(
                      _notice!,
                      style: DayliText.sans(
                        context,
                        size: DayliTextSize.sm,
                        color: colors.foregroundSecondary,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          if (posts != null)
            ProfilePostsSection(
              posts: posts,
              displayName: person.displayName,
              isMe: isMe,
            )
          else
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Text(
                'Add ${person.displayName} as a friend to see their daylies.',
                key: const Key('profile.posts.friendsOnly'),
                textAlign: TextAlign.center,
                style: DayliText.sans(
                  context,
                  size: DayliTextSize.sm,
                  color: colors.foregroundTertiary,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
