import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../api/api_failure.dart';
import '../api/friends_client.dart';
import '../app/app_scope.dart';
import '../app/theme.dart';
import 'friends_controller.dart';

class FriendsScreen extends StatefulWidget {
  const FriendsScreen({super.key});

  @override
  State<FriendsScreen> createState() => _FriendsScreenState();
}

class _FriendsScreenState extends State<FriendsScreen> {
  FriendsController? _controller;
  String? _accountId;
  String _filter = '';
  _FriendsFolder _folder = _FriendsFolder.friends;

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
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final snapshot = controller.snapshot;
        final friends = snapshot?.friends.items ?? const <FriendCard>[];
        final normalized = _filter.trim().toLowerCase();
        final visibleFriends = normalized.isEmpty
            ? friends
            : friends
                  .where(
                    (friend) => '${friend.displayName} ${friend.username}'
                        .toLowerCase()
                        .contains(normalized),
                  )
                  .toList(growable: false);
        return ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          children: [
            Row(
              children: [
                if (GoRouter.maybeOf(context)?.canPop() ?? false)
                  IconButton(
                    tooltip: 'Back',
                    onPressed: () => context.pop(),
                    icon: const Icon(Icons.arrow_back_rounded),
                  )
                else
                  const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    'friends',
                    textAlign: TextAlign.left,
                    style: DayliText.serif(
                      context,
                      fontSize: 34,
                      weight: FontWeight.w400,
                      tracking: -0.06,
                    ),
                  ),
                ),
                FilledButton.icon(
                  onPressed: () => _showDiscovery(context, controller),
                  style: FilledButton.styleFrom(
                    backgroundColor: DayliColors.of(context).foregroundAccent,
                    foregroundColor: DayliColors.of(context).background,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                  ),
                  icon: const Icon(Icons.add_rounded, size: 20),
                  label: const Text(
                    'Add friend',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 28),
            _FolderTabs(
              selected: _folder,
              incomingCount: snapshot?.incoming.items.length ?? 0,
              onChanged: (value) => setState(() => _folder = value),
            ),
            const SizedBox(height: 22),
            if (controller.failure != null)
              _Failure(failure: controller.failure!, onRetry: controller.load),
            if (_folder == _FriendsFolder.friends)
              _FriendsList(
                filter: _filter,
                onFilterChanged: (value) => setState(() => _filter = value),
                friends: visibleFriends,
                loading: controller.loading,
                hasMore: snapshot?.friends.hasMore ?? false,
                busyId: controller.busyId,
                onRemove: (friendId) => controller.mutate(
                  friendId,
                  () => AppScope.of(context).friends.remove(friendId),
                ),
                onLoadMore: controller.loadMoreFriends,
                onDiscover: () => _showDiscovery(context, controller),
              )
            else
              _RequestsList(
                incoming: snapshot?.incoming.items ?? const <FriendRequest>[],
                outgoing: snapshot?.outgoing.items ?? const <FriendRequest>[],
                loading: controller.loading,
                incomingMore: snapshot?.incoming.hasMore ?? false,
                outgoingMore: snapshot?.outgoing.hasMore ?? false,
                busyId: controller.busyId,
                onAccept: (requestId) => controller.mutate(
                  requestId,
                  () => AppScope.of(context).friends.accept(requestId),
                ),
                onDecline: (requestId) => controller.mutate(
                  requestId,
                  () => AppScope.of(context).friends.decline(requestId),
                ),
                onCancel: (requestId) => controller.mutate(
                  requestId,
                  () => AppScope.of(context).friends.cancel(requestId),
                ),
                onLoadMoreIncoming: controller.loadMoreIncoming,
                onLoadMoreOutgoing: controller.loadMoreOutgoing,
              ),
          ],
        );
      },
    );
  }

  Future<void> _showDiscovery(
    BuildContext context,
    FriendsController controller,
  ) {
    final colors = DayliColors.of(context);
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useRootNavigator: true,
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        side: BorderSide(
          color: colors.foreground.withValues(alpha: 0.1),
          width: 1,
        ),
      ),
      builder: (sheetContext) => _DiscoverySheet(controller: controller),
    );
  }
}

enum _FriendsFolder { friends, requests }

class _FolderTabs extends StatelessWidget {
  const _FolderTabs({
    required this.selected,
    required this.incomingCount,
    required this.onChanged,
  });

  final _FriendsFolder selected;
  final int incomingCount;
  final ValueChanged<_FriendsFolder> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Container(
      decoration: BoxDecoration(
        color: Colors.transparent,
        border: Border.all(color: colors.foreground.withValues(alpha: 0.1)),
        borderRadius: BorderRadius.circular(30),
      ),
      padding: const EdgeInsets.all(4),
      child: Material(
        type: MaterialType.transparency,
        child: Row(
          children: [
            Expanded(
              child: _FolderTab(
                label: 'Friends',
                selected: selected == _FriendsFolder.friends,
                onTap: () => onChanged(_FriendsFolder.friends),
              ),
            ),
            Expanded(
              child: _FolderTab(
                label: 'Requests',
                count: incomingCount,
                selected: selected == _FriendsFolder.requests,
                onTap: () => onChanged(_FriendsFolder.requests),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FolderTab extends StatelessWidget {
  const _FolderTab({
    required this.label,
    required this.selected,
    required this.onTap,
    this.count = 0,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final int count;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Semantics(
      button: true,
      selected: selected,
      label: count == 0 ? label : '$label $count',
      child: InkWell(
        key: Key('friends.tab.${label.toLowerCase()}'),
        onTap: onTap,
        borderRadius: BorderRadius.circular(26),
        child: Ink(
          height: 40,
          decoration: BoxDecoration(
            color: selected ? const Color(0xFFEADDFF) : Colors.transparent,
            borderRadius: BorderRadius.circular(26),
          ),
          child: Center(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    label,
                    style: DayliText.sans(
                      context,
                      size: DayliTextSize.base,
                      weight: FontWeight.w500,
                      color: selected
                          ? const Color(0xFF4F378B)
                          : colors.foregroundSecondary,
                    ),
                  ),
                  if (count > 0) ...[
                    const SizedBox(width: 6),
                    Container(
                      constraints: const BoxConstraints(minWidth: 18),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: selected
                            ? const Color(0xFF4F378B)
                            : colors.foregroundAccent,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        '$count',
                        textAlign: TextAlign.center,
                        style: DayliText.sans(
                          context,
                          size: DayliTextSize.xs,
                          weight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _FriendsList extends StatelessWidget {
  const _FriendsList({
    required this.filter,
    required this.onFilterChanged,
    required this.friends,
    required this.loading,
    required this.hasMore,
    required this.busyId,
    required this.onRemove,
    required this.onLoadMore,
    required this.onDiscover,
  });

  final String filter;
  final ValueChanged<String> onFilterChanged;
  final List<FriendCard> friends;
  final bool loading;
  final bool hasMore;
  final String? busyId;
  final ValueChanged<String> onRemove;
  final VoidCallback onLoadMore;
  final VoidCallback onDiscover;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Column(
      children: [
        TextField(
          key: const Key('friends.filter'),
          onChanged: onFilterChanged,
          decoration: InputDecoration(
            hintText: 'Search friends...',
            prefixIcon: Icon(Icons.search, color: colors.foregroundTertiary),
            filled: true,
            fillColor: colors.card,
            contentPadding: const EdgeInsets.symmetric(vertical: 17),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: BorderSide(
                color: colors.foreground.withValues(alpha: 0.08),
              ),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: BorderSide(color: colors.accent, width: 2),
            ),
          ),
        ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(
            key: const Key('friends.discover'),
            onPressed: onDiscover,
            child: Text(
              'Find people by username',
              style: DayliText.sans(
                context,
                size: DayliTextSize.sm,
                color: colors.foregroundSecondary,
              ),
            ),
          ),
        ),
        if (loading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 42),
            child: CircularProgressIndicator(strokeWidth: 2),
          )
        else if (friends.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 42),
            child: Column(
              children: [
                Text(
                  filter.trim().isEmpty
                      ? 'No friends yet'
                      : hasMore
                      ? 'No matches in loaded friends. Load more to keep searching.'
                      : 'No friends found',
                  textAlign: TextAlign.center,
                  style: DayliText.serif(
                    context,
                    size: DayliTextSize.base,
                    weight: FontWeight.w400,
                    color: colors.foregroundSecondary,
                  ),
                ),
                if (filter.trim().isEmpty) ...[
                  const SizedBox(height: 24),
                  SvgPicture.string(
                    '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h20"/><path d="M2 20s4-8 10-8 10 8 10 8"/><circle cx="18" cy="6" r="3"/><path d="M2 20s3-5 8-5 6 5 6 5"/></svg>''',
                    height: 42,
                    colorFilter: ColorFilter.mode(
                      colors.foregroundSecondary.withValues(alpha: 0.35),
                      BlendMode.srcIn,
                    ),
                  ),
                ],
              ],
            ),
          )
        else
          ...friends.map(
            (friend) => _FriendRow(
              friend: friend,
              busy: busyId == friend.id,
              onRemove: () => onRemove(friend.id),
            ),
          ),
        if (hasMore) _LoadMore(onPressed: onLoadMore, label: 'load more'),
      ],
    );
  }
}

class _RequestsList extends StatelessWidget {
  const _RequestsList({
    required this.incoming,
    required this.outgoing,
    required this.loading,
    required this.incomingMore,
    required this.outgoingMore,
    required this.busyId,
    required this.onAccept,
    required this.onDecline,
    required this.onCancel,
    required this.onLoadMoreIncoming,
    required this.onLoadMoreOutgoing,
  });

  final List<FriendRequest> incoming;
  final List<FriendRequest> outgoing;
  final bool loading;
  final bool incomingMore;
  final bool outgoingMore;
  final String? busyId;
  final ValueChanged<String> onAccept;
  final ValueChanged<String> onDecline;
  final ValueChanged<String> onCancel;
  final VoidCallback onLoadMoreIncoming;
  final VoidCallback onLoadMoreOutgoing;

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 42),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );
    }
    if (incoming.isEmpty && outgoing.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 42),
        child: Center(
          child: Text(
            'No pending requests',
            style: DayliText.serif(
              context,
              size: DayliTextSize.base,
              weight: FontWeight.w400,
              color: DayliColors.of(context).foregroundSecondary,
            ),
          ),
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (incoming.isNotEmpty) ...[
          _RequestHeading(label: 'Received'),
          ...incoming
              .where((item) => item.user != null)
              .map(
                (request) => _RequestRow(
                  request: request,
                  received: true,
                  busy: busyId == request.id,
                  onAccept: () => onAccept(request.id),
                  onDecline: () => onDecline(request.id),
                ),
              ),
          if (incomingMore)
            _LoadMore(onPressed: onLoadMoreIncoming, label: 'load more'),
        ],
        if (outgoing.isNotEmpty) ...[
          if (incoming.isNotEmpty) const SizedBox(height: 20),
          _RequestHeading(label: 'Sent'),
          ...outgoing
              .where((item) => item.user != null)
              .map(
                (request) => _RequestRow(
                  request: request,
                  received: false,
                  busy: busyId == request.id,
                  onCancel: () => onCancel(request.id),
                ),
              ),
          if (outgoingMore)
            _LoadMore(onPressed: onLoadMoreOutgoing, label: 'load more'),
        ],
      ],
    );
  }
}

class _RequestHeading extends StatelessWidget {
  const _RequestHeading({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 9),
    child: Text(
      label,
      style: DayliText.sans(
        context,
        size: DayliTextSize.xs,
        weight: FontWeight.w600,
        tracking: 0.08,
        color: DayliColors.of(context).foregroundTertiary,
      ),
    ),
  );
}

class _FriendRow extends StatelessWidget {
  const _FriendRow({
    required this.friend,
    required this.busy,
    required this.onRemove,
  });
  final FriendCard friend;
  final bool busy;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) => _PersonRow(
    person: friend,
    trailing: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _SoftAction(
          label: 'Message',
          muted: true,
          onPressed: () => context.go(
            '/messages/new/${Uri.encodeComponent(friend.username)}',
          ),
        ),
        const SizedBox(width: 7),
        _FriendActions(
          name: friend.displayName,
          enabled: !busy,
          onRemove: onRemove,
        ),
      ],
    ),
  );
}

class _RequestRow extends StatelessWidget {
  const _RequestRow({
    required this.request,
    required this.received,
    required this.busy,
    this.onAccept,
    this.onDecline,
    this.onCancel,
  });

  final FriendRequest request;
  final bool received;
  final bool busy;
  final VoidCallback? onAccept;
  final VoidCallback? onDecline;
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final stackActions = received && constraints.maxWidth < 340;
      final buttons = received
          ? <Widget>[
              _SoftAction(label: 'Accept', onPressed: busy ? null : onAccept),
              _SoftAction(
                label: 'Decline',
                muted: true,
                onPressed: busy ? null : onDecline,
              ),
            ]
          : <Widget>[
              _SoftAction(
                label: 'Cancel',
                muted: true,
                onPressed: busy ? null : onCancel,
              ),
            ];
      final actions = stackActions
          ? Wrap(spacing: 6, runSpacing: 6, children: buttons)
          : Row(mainAxisSize: MainAxisSize.min, spacing: 6, children: buttons);
      return _PersonRow(
        person: request.user!,
        trailing: stackActions ? const SizedBox.shrink() : actions,
        below: stackActions ? actions : null,
      );
    },
  );
}

class _PersonRow extends StatelessWidget {
  const _PersonRow({required this.person, required this.trailing, this.below});
  final FriendCard person;
  final Widget trailing;
  final Widget? below;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final name = person.displayName.trim().isEmpty
        ? person.username
        : person.displayName;
    final initial = name.isEmpty ? '?' : name.substring(0, 1).toUpperCase();
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: colors.card,
        borderRadius: BorderRadius.circular(19),
        border: Border.all(color: colors.foreground.withValues(alpha: 0.07)),
        boxShadow: DayliShadows.card,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              InkWell(
                borderRadius: BorderRadius.circular(13),
                onTap: () =>
                    context.go('/u/${Uri.encodeComponent(person.username)}'),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircleAvatar(
                      radius: 22,
                      backgroundColor: colors.backgroundAccent,
                      child: Text(
                        initial,
                        style: DayliText.serif(
                          context,
                          size: DayliTextSize.xl,
                          weight: FontWeight.w600,
                          color: colors.foregroundAccent,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                  ],
                ),
              ),
              Expanded(
                child: InkWell(
                  borderRadius: BorderRadius.circular(8),
                  onTap: () =>
                      context.go('/u/${Uri.encodeComponent(person.username)}'),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: DayliText.serif(
                          context,
                          size: DayliTextSize.lg,
                          weight: FontWeight.w600,
                          tracking: DayliTracking.tighter,
                        ),
                      ),
                      Text(
                        '@${person.username}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: DayliText.sans(
                          context,
                          size: DayliTextSize.sm,
                          color: colors.foregroundTertiary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              trailing,
            ],
          ),
          if (below != null)
            Padding(
              padding: const EdgeInsets.only(left: 56, top: 8),
              child: Align(alignment: Alignment.centerLeft, child: below),
            ),
        ],
      ),
    );
  }
}

class _FriendActions extends StatelessWidget {
  const _FriendActions({
    required this.name,
    required this.enabled,
    required this.onRemove,
  });

  final String name;
  final bool enabled;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: 'Friend actions for $name',
    child: PopupMenuButton<String>(
      key: Key('friends.actions.$name'),
      enabled: enabled,
      tooltip: 'Friend actions',
      onSelected: (value) {
        if (value == 'remove') onRemove();
      },
      itemBuilder: (context) => const [
        PopupMenuItem(value: 'remove', child: Text('Remove friend')),
      ],
      child: Container(
        width: 32,
        height: 36,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          border: Border.all(
            color: DayliColors.of(context).foreground.withValues(alpha: 0.15),
          ),
          borderRadius: BorderRadius.circular(9),
        ),
        child: Icon(
          Icons.more_horiz,
          size: 21,
          color: DayliColors.of(context).foregroundSecondary,
        ),
      ),
    ),
  );
}

class _SoftAction extends StatelessWidget {
  const _SoftAction({
    required this.label,
    required this.onPressed,
    this.muted = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return TextButton(
      onPressed: onPressed,
      style: TextButton.styleFrom(
        minimumSize: const Size(0, 38),
        padding: const EdgeInsets.symmetric(horizontal: 8),
        foregroundColor: muted
            ? colors.foregroundSecondary
            : colors.foregroundAccent,
        backgroundColor: muted ? null : colors.backgroundAccent,
        side: muted
            ? BorderSide(color: colors.foreground.withValues(alpha: 0.12))
            : null,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      child: Text(
        label,
        style: DayliText.sans(
          context,
          size: DayliTextSize.sm,
          weight: FontWeight.w600,
          color: muted ? colors.foregroundSecondary : colors.foregroundAccent,
        ),
      ),
    );
  }
}

class _LoadMore extends StatelessWidget {
  const _LoadMore({required this.onPressed, required this.label});
  final VoidCallback onPressed;
  final String label;

  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.centerLeft,
    child: TextButton(
      onPressed: onPressed,
      child: Text(
        label,
        style: DayliText.sans(context, size: DayliTextSize.sm),
      ),
    ),
  );
}

class _DiscoverySheet extends StatefulWidget {
  const _DiscoverySheet({required this.controller});
  final FriendsController controller;

  @override
  State<_DiscoverySheet> createState() => _DiscoverySheetState();
}

class _DiscoverySheetState extends State<_DiscoverySheet> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final availableHeight =
        MediaQuery.sizeOf(context).height -
        MediaQuery.viewInsetsOf(context).bottom;
    return SafeArea(
      child: SizedBox(
        height: availableHeight * 0.88,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
          child: AnimatedBuilder(
            animation: widget.controller,
            builder: (context, _) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'find someone',
                  style: DayliText.serif(
                    context,
                    size: DayliTextSize.xxl,
                    weight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  key: const Key('friends.discoverySearch'),
                  autofocus: true,
                  maxLength: 32,
                  onChanged: (value) {
                    setState(() => _query = value);
                    widget.controller.search(value);
                  },
                  decoration: const InputDecoration(
                    prefixText: '@',
                    hintText: 'username',
                    counterText: '',
                  ),
                ),
                const SizedBox(height: 12),
                Expanded(
                  child: _DiscoveryResults(
                    query: _query,
                    controller: widget.controller,
                    colors: colors,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DiscoveryResults extends StatelessWidget {
  const _DiscoveryResults({
    required this.query,
    required this.controller,
    required this.colors,
  });

  final String query;
  final FriendsController controller;
  final DayliColors colors;

  @override
  Widget build(BuildContext context) {
    if (controller.searching) {
      return const Center(child: CircularProgressIndicator(strokeWidth: 2));
    }
    if (query.trim().length >= 2 && controller.results.items.isEmpty) {
      return Center(
        child: Text(
          'No matching usernames yet.',
          style: DayliText.sans(
            context,
            size: DayliTextSize.sm,
            color: colors.foregroundTertiary,
          ),
        ),
      );
    }
    return ListView(
      key: const Key('friends.discoveryResults'),
      children: [
        ...controller.results.items.map(
          (person) => _PersonRow(
            person: person,
            trailing: _SoftAction(
              label: person.relationship == 'none'
                  ? 'Add'
                  : person.relationship == 'friends'
                  ? 'friends'
                  : 'requested',
              onPressed:
                  person.relationship == 'none' &&
                      controller.busyId != person.id
                  ? () => controller.mutate(
                      person.id,
                      () => AppScope.of(context).friends.send(person.id),
                    )
                  : null,
            ),
          ),
        ),
        if (controller.results.hasMore)
          _LoadMore(
            onPressed: () => controller.loadMoreSearch(query),
            label: 'load more',
          ),
      ],
    );
  }
}

class _Failure extends StatelessWidget {
  const _Failure({required this.failure, required this.onRetry});
  final ApiFailure failure;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 16),
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: DayliColors.of(context).card,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(
        color: DayliColors.of(context).foreground.withValues(alpha: 0.1),
      ),
    ),
    child: Row(
      children: [
        Expanded(
          child: Text(
            failure is NetworkUnavailable
                ? "You're offline. Try again when you're connected."
                : 'Friends could not load right now.',
            style: DayliText.sans(context, size: DayliTextSize.sm),
          ),
        ),
        TextButton(onPressed: onRetry, child: const Text('try again')),
      ],
    ),
  );
}
