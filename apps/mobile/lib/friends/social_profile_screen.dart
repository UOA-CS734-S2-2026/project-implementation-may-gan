import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_failure.dart';
import '../api/friends_client.dart';
import '../app/app_scope.dart';
import '../auth/session_controller.dart';
import '../app/theme.dart';
import '../ui/dayli_button.dart';
import '../ui/surfaces.dart';

/// Account-scoped, WDCC-inspired minimal profile. It never exposes provider data or invented profile fields.
class SocialProfileScreen extends StatefulWidget {
  const SocialProfileScreen({super.key, required this.username});
  final String username;
  @override
  State<SocialProfileScreen> createState() => _SocialProfileScreenState();
}

class _SocialProfileScreenState extends State<SocialProfileScreen> {
  Future<ApiResult<FriendCard>>? _profile;
  String? _accountId;
  String? _loadedUsername;
  SessionController? _session;
  bool _busy = false;
  String? _notice;
  String? _authorizedProfileId;

  Future<ApiResult<FriendCard>> _load() =>
      AppScope.of(context).friends.profile(widget.username);

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
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    _syncActor();
    return FutureBuilder<ApiResult<FriendCard>>(
      key: ValueKey((_accountId, widget.username)),
      future: _profile,
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.data case ApiSuccess<FriendCard>(value: final person)) {
          _authorizedProfileId = person.id;
          return _profileCard(context, person);
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

  Widget _profileCard(BuildContext context, FriendCard person) {
    final colors = DayliColors.of(context);
    final label = person.relationship == 'none'
        ? 'add friend'
        : person.relationship == 'friends'
        ? 'remove friend'
        : person.relationship == 'incoming_pending'
        ? 'request waiting'
        : 'request sent';
    return ListView(
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
              const SizedBox(height: 22),
              if (person.relationship == 'none' ||
                  person.relationship == 'friends')
                SizedBox(
                  width: double.infinity,
                  child: DayliButton(
                    label: label,
                    onPressed: _busy ? null : () => _friend(person),
                  ),
                )
              else
                Text(
                  label,
                  style: DayliText.sans(
                    context,
                    size: DayliTextSize.sm,
                    color: colors.foregroundSecondary,
                  ),
                ),
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
        const SizedBox(height: 14),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Text(
            'This profile only shares the name they chose and their username.',
            style: DayliText.sans(
              context,
              size: DayliTextSize.sm,
              color: colors.foregroundTertiary,
            ),
          ),
        ),
      ],
    );
  }
}
