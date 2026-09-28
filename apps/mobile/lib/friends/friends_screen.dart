import 'package:flutter/material.dart';

import '../api/api_failure.dart';
import '../api/friends_client.dart';
import '../app/app_scope.dart';
import '../app/theme.dart';
import '../ui/dayli_button.dart';
import '../ui/surfaces.dart';
import 'friends_controller.dart';

class FriendsScreen extends StatefulWidget {
  const FriendsScreen({super.key});
  @override
  State<FriendsScreen> createState() => _FriendsScreenState();
}

class _FriendsScreenState extends State<FriendsScreen> {
  FriendsController? _controller;
  String? _accountId;
  String _query = '';

  FriendsController _forContext(BuildContext context) {
    final services = AppScope.of(context);
    final accountId = services.session.user?.id;
    if (_controller == null || _accountId != accountId) {
      _controller?.dispose();
      _accountId = accountId;
      _controller = FriendsController(
        client: services.friends,
        activeUserId: () => services.session.user?.id,
      )..load();
    }
    return _controller!;
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _forContext(context);
    final colors = DayliColors.of(context);
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final snapshot = controller.snapshot;
        final incoming = snapshot?.incoming.items ?? const <FriendRequest>[];
        final outgoing = snapshot?.outgoing.items ?? const <FriendRequest>[];
        return ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          children: [
            Text(
              'friends',
              style: DayliText.serif(
                context,
                fontSize: 34,
                weight: FontWeight.w600,
                tracking: DayliTracking.tighter,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Find people by username, then keep your circle close.',
              style: DayliText.serif(
                context,
                size: DayliTextSize.lg,
                color: colors.foregroundSecondary,
              ),
            ),
            const SizedBox(height: 24),
            DayliCard(
              padding: const EdgeInsets.all(20),
              radius: 20,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'find someone',
                    style: DayliText.serif(
                      context,
                      size: DayliTextSize.xl,
                      weight: FontWeight.w600,
                    ),
                  ),
                  TextField(
                    key: const Key('friends.search'),
                    onChanged: (value) {
                      setState(() => _query = value);
                      controller.search(value);
                    },
                    maxLength: 32,
                    decoration: const InputDecoration(
                      prefixText: '@',
                      hintText: 'username',
                      counterText: '',
                    ),
                  ),
                  Text(
                    'Search starts after two characters. Private accounts show only a username and display name.',
                    style: DayliText.sans(
                      context,
                      size: DayliTextSize.sm,
                      color: colors.foregroundTertiary,
                    ),
                  ),
                  if (controller.searching)
                    const Padding(
                      padding: EdgeInsets.only(top: 14),
                      child: Center(
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    ),
                  ...controller.results.items.map(
                    (person) => _Card(
                      person: person,
                      action: person.relationship == 'none'
                          ? 'add friend'
                          : person.relationship == 'outgoing_pending'
                          ? 'request sent'
                          : person.relationship == 'incoming_pending'
                          ? 'check requests'
                          : 'friends',
                      enabled:
                          person.relationship == 'none' &&
                          controller.busyId != person.id,
                      onAction: () => controller.mutate(
                        person.id,
                        () => AppScope.of(context).friends.send(person.id),
                      ),
                    ),
                  ),
                  if (controller.results.hasMore)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: DayliButton(
                        label: 'load more',
                        size: ButtonSize.sm,
                        onPressed: () => controller.loadMoreSearch(_query),
                      ),
                    ),
                ],
              ),
            ),
            if (controller.failure != null)
              _Failure(failure: controller.failure!, onRetry: controller.load),
            const SizedBox(height: 24),
            DayliCard(
              padding: const EdgeInsets.all(20),
              radius: 20,
              child: _Requests(
                title: 'requests',
                incoming: incoming,
                outgoing: outgoing,
                incomingMore: snapshot?.incoming.hasMore ?? false,
                outgoingMore: snapshot?.outgoing.hasMore ?? false,
                controller: controller,
              ),
            ),
            const SizedBox(height: 18),
            DayliCard(
              padding: const EdgeInsets.all(20),
              radius: 20,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'your circle',
                    style: DayliText.serif(
                      context,
                      size: DayliTextSize.xl,
                      weight: FontWeight.w600,
                    ),
                  ),
                  if (controller.loading)
                    const Padding(
                      padding: EdgeInsets.only(top: 16),
                      child: Center(
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    )
                  else if (snapshot?.friends.items.isEmpty ?? true)
                    Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: Text(
                        'No friends here yet. Search a username to start.',
                        style: DayliText.serif(
                          context,
                          color: colors.foregroundSecondary,
                        ),
                      ),
                    )
                  else
                    ...snapshot!.friends.items.map(
                      (person) => _Card(
                        person: person,
                        action: 'remove',
                        enabled: controller.busyId != person.id,
                        onAction: () => controller.mutate(
                          person.id,
                          () => AppScope.of(context).friends.remove(person.id),
                        ),
                      ),
                    ),
                  if (snapshot!.friends.hasMore)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: DayliButton(
                        label: 'load more',
                        size: ButtonSize.sm,
                        onPressed: controller.loadMoreFriends,
                      ),
                    ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

class _Requests extends StatelessWidget {
  const _Requests({
    required this.title,
    required this.incoming,
    required this.outgoing,
    required this.incomingMore,
    required this.outgoingMore,
    required this.controller,
  });
  final String title;
  final List<FriendRequest> incoming;
  final List<FriendRequest> outgoing;
  final bool incomingMore;
  final bool outgoingMore;
  final FriendsController controller;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        title,
        style: DayliText.serif(
          context,
          size: DayliTextSize.xl,
          weight: FontWeight.w600,
        ),
      ),
      const SizedBox(height: 12),
      _RequestGroup(
        title: 'incoming',
        empty: 'No one is waiting on you.',
        requests: incoming,
        controller: controller,
      ),
      if (incomingMore)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: DayliButton(
            label: 'load more',
            size: ButtonSize.sm,
            onPressed: controller.loadMoreIncoming,
          ),
        ),
      const SizedBox(height: 16),
      _RequestGroup(
        title: 'sent',
        empty: 'You have not sent any requests.',
        requests: outgoing,
        controller: controller,
      ),
      if (outgoingMore)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: DayliButton(
            label: 'load more',
            size: ButtonSize.sm,
            onPressed: controller.loadMoreOutgoing,
          ),
        ),
    ],
  );
}

class _RequestGroup extends StatelessWidget {
  const _RequestGroup({
    required this.title,
    required this.empty,
    required this.requests,
    required this.controller,
  });
  final String title;
  final String empty;
  final List<FriendRequest> requests;
  final FriendsController controller;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        title,
        style: DayliText.serif(
          context,
          size: DayliTextSize.lg,
          weight: FontWeight.w600,
        ),
      ),
      if (requests.isEmpty)
        Text(
          empty,
          style: DayliText.sans(
            context,
            size: DayliTextSize.sm,
            color: DayliColors.of(context).foregroundTertiary,
          ),
        )
      else
        ...requests.map(
          (request) => _Card(
            person: request.user!,
            action: title == 'incoming' ? 'accept' : 'cancel request',
            enabled: controller.busyId != request.id,
            onAction: () => controller.mutate(
              request.id,
              () => title == 'incoming'
                  ? AppScope.of(context).friends.accept(request.id)
                  : AppScope.of(context).friends.cancel(request.id),
            ),
            secondary: title == 'incoming'
                ? () => controller.mutate(
                    request.id,
                    () => AppScope.of(context).friends.decline(request.id),
                  )
                : null,
          ),
        ),
    ],
  );
}

class _Card extends StatelessWidget {
  const _Card({
    required this.person,
    required this.action,
    required this.enabled,
    required this.onAction,
    this.secondary,
  });
  final FriendCard person;
  final String action;
  final bool enabled;
  final VoidCallback onAction;
  final VoidCallback? secondary;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 12),
    child: Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                person.displayName,
                style: DayliText.serif(
                  context,
                  size: DayliTextSize.lg,
                  weight: FontWeight.w600,
                ),
              ),
              Text(
                '@${person.username}',
                style: DayliText.sans(
                  context,
                  size: DayliTextSize.sm,
                  color: DayliColors.of(context).foregroundTertiary,
                ),
              ),
            ],
          ),
        ),
        if (secondary != null)
          Padding(
            padding: const EdgeInsets.only(right: 6),
            child: DayliButton(
              label: 'decline',
              size: ButtonSize.sm,
              color: ButtonColor.foreground,
              onPressed: enabled ? secondary : null,
            ),
          ),
        DayliButton(
          label: action,
          size: ButtonSize.sm,
          onPressed: enabled ? onAction : null,
        ),
      ],
    ),
  );
}

class _Failure extends StatelessWidget {
  const _Failure({required this.failure, required this.onRetry});
  final ApiFailure failure;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 16),
    child: DayliCard(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Expanded(
            child: Text(
              failure is NetworkUnavailable
                  ? "You're offline. Try again when you're connected."
                  : 'Friends could not load right now.',
              style: DayliText.serif(context),
            ),
          ),
          DayliButton(
            label: 'try again',
            size: ButtonSize.sm,
            onPressed: onRetry,
          ),
        ],
      ),
    ),
  );
}
