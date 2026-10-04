import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_failure.dart';
import '../api/friends_client.dart';
import '../api/profile_client.dart';
import '../app/app_scope.dart';
import '../app/theme.dart';
import '../auth/public_return_intent.dart';
import '../auth/session_controller.dart';
import '../posts/post_activity.dart';
import '../profile/mood_history_card.dart';
import '../profile/profile_about.dart';
import '../profile/profile_posts.dart';
import '../profile/profile_stats.dart';
import '../profile/streak_cache.dart';
import '../ui/dayli_button.dart';
import '../ui/surfaces.dart';

class SocialProfileScreen extends StatefulWidget {
  const SocialProfileScreen({
    super.key,
    required this.username,
    this.followRenames = true,
    this.intent,
    this.intentActorId,
  });

  final String username;
  final bool followRenames;
  final PublicActionIntent? intent;
  final String? intentActorId;

  @override
  State<SocialProfileScreen> createState() => _SocialProfileScreenState();
}

typedef _LoadedProfile = ({ProfileDetails info, FriendCard? person});

const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', //
  'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec',
];

class _SocialProfileScreenState extends State<SocialProfileScreen>
    with WidgetsBindingObserver {
  Future<ApiResult<_LoadedProfile>>? _profile;
  SessionController? _session;
  (SessionStatus, String?, int)? _sessionIdentity;
  String? _loadedUsername;
  int _requestGeneration = 0;
  bool _busy = false;
  String? _notice;
  String? _authorizedProfileId;
  ProfilePostsController? _posts;
  ((SessionStatus, String?, int), String)? _postsFor;
  PostActivity? _activity;

  /// Your own profile as the server last returned it for this account, and
  /// when. A reload that fails offline keeps showing it, marked as stale.
  /// Other profiles never fall back, since access to them can change.
  _LoadedProfile? _last;
  DateTime? _lastConfirmedAt;

  /// When the profile on screen was last confirmed, if a reload since failed.
  DateTime? _staleSince;

  /// Your own streak from the device, when your profile can't load offline.
  CachedStreak? _offlineStreak;

  (SessionStatus, String?, int) _currentSessionIdentity() {
    final session = _session!;
    return (session.status, session.user?.id, session.generation);
  }

  bool _isCurrentLoad(
    int requestGeneration,
    String username,
    (SessionStatus, String?, int) identity,
  ) =>
      mounted &&
      requestGeneration == _requestGeneration &&
      username == widget.username &&
      identity == _currentSessionIdentity();

  Future<ApiResult<_LoadedProfile>> _startLoad() {
    final requestGeneration = ++_requestGeneration;
    return _loadWithFallback(
      requestGeneration,
      widget.username,
      _currentSessionIdentity(),
    );
  }

  /// Loads the profile, then keeps your own streak for offline use. Offline,
  /// your own profile falls back to the last one confirmed here, or to just
  /// the streak this device last had confirmed.
  Future<ApiResult<_LoadedProfile>> _loadWithFallback(
    int requestGeneration,
    String username,
    (SessionStatus, String?, int) identity,
  ) async {
    final services = AppScope.of(context);
    final accountId = identity.$2;
    // Taken before the request, so a cache cleared meanwhile, such as by
    // signing out, refuses this load's write.
    final cacheEpoch = services.streakCache.epoch;
    bool current() => _isCurrentLoad(requestGeneration, username, identity);

    final result = await _load(requestGeneration, username, identity);
    // A newer load, another account or another profile has taken over.
    if (!current()) return result;
    switch (result) {
      case ApiSuccess(value: final loaded) when loaded.info.isOwner:
        final now = services.clock();
        _last = loaded;
        _lastConfirmedAt = now;
        _staleSince = null;
        _offlineStreak = null;
        if ((loaded.info.streak, accountId) case (final streak?, final id?)) {
          unawaited(
            services.streakCache.write(
              id,
              CachedStreak(streak, now),
              epoch: cacheEpoch,
            ),
          );
        }
      case ApiSuccess():
        _last = null;
        _lastConfirmedAt = null;
        _staleSince = null;
        _offlineStreak = null;
      case ApiError(failure: NetworkUnavailable()):
        if (_last case final last?) {
          _staleSince = _lastConfirmedAt;
          return ApiSuccess(last);
        }
        if (accountId != null && _isOwnHandle(username)) {
          final cached = await services.streakCache.read(accountId);
          if (current()) _offlineStreak = cached;
        }
      case ApiError():
        break;
    }
    return result;
  }

  bool _isOwnHandle(String username) =>
      _session?.user?.username?.toLowerCase() == username.toLowerCase();

  Future<ApiResult<_LoadedProfile>> _load(
    int requestGeneration,
    String username,
    (SessionStatus, String?, int) identity,
  ) async {
    final services = AppScope.of(context);
    final details = await services.profiles.details(username);
    if (!_isCurrentLoad(requestGeneration, username, identity)) {
      return const ApiError(ServiceUnavailable());
    }
    if (details case ApiError(:final failure)) {
      if (failure is Unauthenticated && identity.$1 == SessionStatus.signedIn) {
        await services.session.sessionExpired();
      }
      return ApiError(failure);
    }
    final info = (details as ApiSuccess<ProfileDetails>).value;
    if (identity.$1 != SessionStatus.signedIn) {
      return ApiSuccess((info: info, person: null));
    }

    // The public and restricted DTOs contain no account ID. Resolve the
    // session-authorized relationship after sign-in before enabling a write.
    final card = await services.friends.profile(info.username);
    if (!_isCurrentLoad(requestGeneration, username, identity)) {
      return const ApiError(ServiceUnavailable());
    }
    if (card case ApiError(failure: Unauthenticated())) {
      await services.session.sessionExpired();
      return const ApiError(Unauthenticated());
    }
    return switch (card) {
      ApiSuccess(value: final person) => ApiSuccess((
        info: info,
        person: person,
      )),
      ApiError() when info.isPublic => ApiSuccess((info: info, person: null)),
      ApiError(:final failure) => ApiError(failure),
    };
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final session = AppScope.of(context).session;
    if (_session != session) {
      _session?.removeListener(_onSessionChanged);
      _session = session..addListener(_onSessionChanged);
    }
    final activity = AppScope.of(context).postActivity;
    if (_activity != activity) {
      _activity?.removeListener(_onPostActivity);
      _activity = activity..addListener(_onPostActivity);
    }
    _syncActor();
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  /// The streak and today's mark move with the date, so check again when the
  /// app returns to the foreground.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _reload();
  }

  /// Your own post was accepted or deleted, which can change your streak.
  void _onPostActivity() {
    if (_last?.info.isOwner == true || _isOwnHandle(widget.username)) {
      _reload();
    }
  }

  void _reload() {
    if (!mounted) return;
    setState(() {
      _profile = _startLoad();
    });
    unawaited(_posts?.refresh());
  }

  @override
  void didUpdateWidget(covariant SocialProfileScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.username != widget.username ||
        oldWidget.intent != widget.intent ||
        oldWidget.intentActorId != widget.intentActorId) {
      _syncActor(force: true);
    }
  }

  void _onSessionChanged() {
    if (!mounted) return;
    _syncActor();
    setState(() {});
  }

  void _syncActor({bool force = false}) {
    final identity = _currentSessionIdentity();
    if (force ||
        _profile == null ||
        _sessionIdentity != identity ||
        _loadedUsername != widget.username) {
      _sessionIdentity = identity;
      _loadedUsername = widget.username;
      _notice = null;
      _authorizedProfileId = null;
      _last = null;
      _lastConfirmedAt = null;
      _staleSince = null;
      _offlineStreak = null;
      _clearPosts();
      _profile = _startLoad();
    }
  }

  void _clearPosts() {
    final stale = _posts;
    _posts = null;
    _postsFor = null;
    if (stale != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => stale.dispose());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _session?.removeListener(_onSessionChanged);
    _activity?.removeListener(_onPostActivity);
    _posts?.dispose();
    super.dispose();
  }

  ProfilePostsController? _postsController(
    ProfileDetails info,
    FriendCard? person,
  ) {
    final canSee =
        !info.isRestricted &&
        info.detailsVisible &&
        (info.isPublic || info.isOwner || person?.relationship == 'friends');
    final owner = (_sessionIdentity!, info.username);
    if (!canSee) {
      _clearPosts();
      return null;
    }
    if (_postsFor != owner) {
      _clearPosts();
    }
    if (_posts == null) {
      _postsFor = owner;
      _posts = ProfilePostsController(AppScope.of(context).posts, info.username)
        ..refresh();
    }
    return _posts;
  }

  /// Bumped on pull to refresh so the mood history reloads too.
  int _moodRefresh = 0;

  Future<void> _refresh() async {
    setState(() {
      _profile = _startLoad();
      _moodRefresh++;
    });
    await Future.wait([?_profile, ?_posts?.refresh()]);
  }

  void _followRename(ProfileDetails info) {
    if (info.username.toLowerCase() == widget.username.toLowerCase()) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (info.isOwner) {
        AppScope.of(context).session.usernameChanged(info.username);
      }
      if (widget.followRenames) {
        context.go('/u/${Uri.encodeComponent(info.username)}');
      }
    });
  }

  void _requireSignIn(PublicActionIntent action) {
    final target = '/u/${Uri.encodeComponent(widget.username)}';
    final intent = _session?.issuePublicReturnIntent(target, action);
    context.go(intent?.authLocation() ?? '/sign-in');
  }

  Future<void> _friend(FriendCard person) async {
    final accountAtStart = _session?.user?.id;
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
    final result = person.relationship == 'none'
        ? await AppScope.of(context).friends.send(person.id)
        : person.relationship == 'friends'
        ? await AppScope.of(context).friends.remove(person.id)
        : const ApiSuccess<void>(null);
    if (!mounted || accountAtStart != _session?.user?.id) return;
    setState(() {
      _busy = false;
      _notice = result is ApiError<void>
          ? 'That action is unavailable. Please try again.'
          : null;
      _profile = _startLoad();
    });
  }

  Future<void> _confirmRemove(FriendCard person) async {
    final remove = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        key: const Key('profile.removeFriend'),
        title: const Text('Remove friend'),
        content: Text(
          'Are you sure you want to remove @${person.username} from your friends?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            key: const Key('profile.removeFriend.confirm'),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (remove == true && mounted) await _friend(person);
  }

  Future<void> _edit() async {
    await context.push('/profile/edit');
    if (mounted) await _refresh();
  }

  @override
  Widget build(BuildContext context) {
    _syncActor();
    return FutureBuilder<ApiResult<_LoadedProfile>>(
      key: ValueKey((_sessionIdentity, widget.username)),
      future: _profile,
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        if (snapshot.data case ApiSuccess(value: final loaded)) {
          _authorizedProfileId = loaded.person?.id;
          _followRename(loaded.info);
          return _profilePage(context, loaded.info, loaded.person);
        }
        if ((snapshot.data, _offlineStreak) case (
          ApiError(failure: NetworkUnavailable()),
          final cached?,
        )) {
          return _offlineCard(context, cached);
        }
        return Scaffold(
          body: Center(
            child: DayliCard(
              padding: const EdgeInsets.all(24),
              child: Text(
                'This profile is unavailable.',
                style: DayliText.serif(context),
              ),
            ),
          ),
        );
      },
    );
  }

  String _confirmedNote(DateTime at) {
    final local = at.toLocal();
    final now = AppScope.of(context).clock().toLocal();
    if (local.year == now.year &&
        local.month == now.month &&
        local.day == now.day) {
      final hour = local.hour % 12 == 0 ? 12 : local.hour % 12;
      final minute = local.minute.toString().padLeft(2, '0');
      return 'Last confirmed at $hour:$minute ${local.hour < 12 ? 'am' : 'pm'}';
    }
    return 'Last confirmed ${local.day} ${_months[local.month - 1]}';
  }

  /// Your own profile when it can't load offline: only the streak this
  /// device last had confirmed, clearly marked. Pull to try again.
  Widget _offlineCard(BuildContext context, CachedStreak cached) {
    return Scaffold(
      backgroundColor: DayliColors.of(context).background,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 36, 20, 32),
            children: [
              DayliCard(
                key: const Key('profile.offline'),
                padding: const EdgeInsets.all(24),
                radius: 22,
                child: Column(
                  children: [
                    Text(
                      "You're offline, so your profile couldn't be loaded.",
                      textAlign: TextAlign.center,
                      style: DayliText.serif(context),
                    ),
                    ProfileStatsTile(
                      stats: null,
                      streak: cached.streak,
                      staleNote: _confirmedNote(cached.confirmedAt),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _avatar(
    BuildContext context,
    ProfileDetails info,
    String displayName,
  ) {
    final url = info.avatarUrl;
    return FutureBuilder<String?>(
      future: _session?.bearerToken(),
      builder: (context, token) => Container(
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
          boxShadow: DayliShadows.md,
        ),
        child: CircleAvatar(
          key: const Key('profile.avatar'),
          radius: 56,
          backgroundColor: DayliColors.of(context).backgroundAccent,
          foregroundImage: url == null
              ? null
              : NetworkImage(
                  url,
                  headers: token.data == null
                      ? null
                      : {'authorization': 'Bearer ${token.data}'},
                ),
          onForegroundImageError: url == null ? null : (_, _) {},
          child: Text(
            displayName.isEmpty
                ? '?'
                : displayName.characters.first.toUpperCase(),
            style: DayliText.serif(
              context,
              size: DayliTextSize.xxxxl,
              color: DayliColors.of(context).foregroundAccent,
            ),
          ),
        ),
      ),
    );
  }

  Widget _profilePage(
    BuildContext context,
    ProfileDetails info,
    FriendCard? person,
  ) {
    final colors = DayliColors.of(context);
    final signedIn = _session?.status == SessionStatus.signedIn;
    final isMe =
        info.isOwner ||
        (person != null &&
            _session?.user != null &&
            person.id == _session!.user!.id);
    final displayName = info.isPublic || info.isRestricted
        ? info.displayName ?? info.username
        : person?.displayName ?? info.displayName ?? info.username;
    final posts = _postsController(info, person);
    final relationship = person?.relationship;
    final intent = widget.intent;

    return Scaffold(
      backgroundColor: colors.background,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
            children: [
              if ((GoRouter.maybeOf(context)?.canPop() ?? false) || !signedIn)
                Align(
                  alignment: Alignment.centerLeft,
                  child: IconButton(
                    tooltip: 'Back',
                    onPressed: () => context.canPop()
                        ? context.pop()
                        : context.go('/welcome'),
                    icon: const Icon(Icons.arrow_back_rounded),
                  ),
                ),
              DayliCard(
                padding: const EdgeInsets.all(28),
                radius: 22,
                child: Column(
                  children: [
                    if (!info.isRestricted) _avatar(context, info, displayName),
                    if (!info.isRestricted) const SizedBox(height: 14),
                    Text(
                      '@${info.username}',
                      key: const Key('profile.username'),
                      style: DayliText.sans(
                        context,
                        color: colors.foregroundTertiary,
                      ),
                    ),
                    if (!info.isRestricted)
                      Text(
                        displayName,
                        style: DayliText.serif(
                          context,
                          size: DayliTextSize.xxl,
                          weight: FontWeight.w600,
                        ),
                      ),
                    if (info.isRestricted || !info.detailsVisible) ...[
                      const SizedBox(height: 12),
                      Text(
                        info.isRestricted
                            ? 'This profile is private.'
                            : "$displayName's profile is private.",
                        key: const Key('profile.private'),
                        textAlign: TextAlign.center,
                        style: DayliText.sans(
                          context,
                          color: colors.foregroundTertiary,
                        ),
                      ),
                    ] else if (info.bio case final bio?) ...[
                      const SizedBox(height: 10),
                      Text(
                        bio,
                        key: const Key('profile.bio'),
                        textAlign: TextAlign.center,
                      ),
                    ],
                    if (info.detailsVisible && !info.isPublic)
                      ProfileAboutCards(
                        mbti: info.mbti,
                        whatIDo: info.whatIDo,
                        listeningTo: info.listeningTo,
                      ),
                    if ((info.stats, info.streak) case (
                      final stats?,
                      final streak?,
                    ))
                      ProfileStatsTile(
                        stats: stats,
                        streak: streak,
                        onFriends: isMe ? () => context.go('/friends') : null,
                        showToday: isMe,
                        staleNote: _staleSince == null
                            ? null
                            : _confirmedNote(_staleSince!),
                      )
                    else if (info.streak case final streak?)
                      Padding(
                        padding: const EdgeInsets.only(top: 16),
                        child: Text(
                          '${streak.current} day streak',
                          key: const Key('profile.publicStreak'),
                        ),
                      ),
                    const SizedBox(height: 22),
                    if (intent != null &&
                        signedIn &&
                        widget.intentActorId == _session?.user?.id)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Text(
                          _intentMessage(intent),
                          key: const Key('profile.intent'),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    if (isMe)
                      SizedBox(
                        width: double.infinity,
                        child: DayliButton(
                          key: const Key('profile.edit'),
                          label: 'edit profile',
                          onPressed: _edit,
                        ),
                      )
                    else ...[
                      SizedBox(
                        width: double.infinity,
                        child: DayliButton(
                          key: const Key('profile.friend'),
                          label: relationship == 'friends'
                              ? 'friends'
                              : 'add friend',
                          onPressed: _busy
                              ? null
                              : !signedIn
                              ? () => _requireSignIn(
                                  PublicActionIntent.friendRequest,
                                )
                              : person == null ||
                                    (relationship != 'none' &&
                                        relationship != 'friends')
                              ? null
                              : () => relationship == 'friends'
                                    ? _confirmRemove(person)
                                    : _friend(person),
                        ),
                      ),
                      const SizedBox(height: 10),
                      SizedBox(
                        width: double.infinity,
                        child: DayliButton(
                          key: const Key('profile.message'),
                          label: 'message',
                          color: ButtonColor.background,
                          onPressed: !signedIn
                              ? () => _requireSignIn(
                                  PublicActionIntent.messageRequest,
                                )
                              : person == null
                              ? null
                              : () => context.go(
                                  '/messages/new/${Uri.encodeComponent(info.username)}',
                                ),
                        ),
                      ),
                    ],
                    if (_notice != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Text(_notice!),
                      ),
                  ],
                ),
              ),
              // Mood history reaches the owner and active friends only, even
              // when the account is public.
              if (signedIn && (isMe || relationship == 'friends'))
                MoodHistoryCard(
                  // A new account never sees the previous one's view.
                  key: ValueKey(('mood', _session?.user?.id, info.username)),
                  profiles: AppScope.of(context).profiles,
                  username: info.username,
                  displayName: displayName,
                  isMe: isMe,
                  refreshCount: _moodRefresh,
                ),
              const SizedBox(height: 20),
              if (posts != null)
                ProfilePostsSection(
                  posts: posts,
                  displayName: displayName,
                  isMe: isMe,
                  // Reloads the details too, so Loved and the streak stay current.
                  onChanged: _refresh,
                )
              else
                Text(
                  signedIn && !info.isRestricted
                      ? 'Add $displayName as a friend to see their daylies.'
                      : 'Sign in or become friends to see this journal.',
                  key: const Key('profile.posts.friendsOnly'),
                  textAlign: TextAlign.center,
                ),
            ],
          ),
        ),
      ),
    );
  }

  String _intentMessage(PublicActionIntent intent) => switch (intent) {
    PublicActionIntent.friendRequest =>
      'Review and confirm the friend request below.',
    PublicActionIntent.messageRequest =>
      'Review and start the message request below.',
    PublicActionIntent.like =>
      'Likes are not available in this app version yet.',
    PublicActionIntent.comment =>
      'Comments are not available in this app version yet.',
  };
}
