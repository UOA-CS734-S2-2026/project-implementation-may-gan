import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_failure.dart';
import '../api/friends_client.dart';
import '../app/app_scope.dart';
import '../app/theme.dart';
import '../auth/session_controller.dart';
import 'messaging_client.dart';

class MessagesScreen extends StatefulWidget {
  const MessagesScreen({super.key});

  @override
  State<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends State<MessagesScreen> {
  _MessageFolder _folder = _MessageFolder.messages;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => AppScope.of(context).messaging.refreshInbox(),
    );
  }

  Future<void> _startConversation() async {
    final username = await showDialog<String>(
      context: context,
      builder: (_) => const _NewConversationDialog(),
    );
    if (mounted && username != null) {
      context.go('/messages/new/${Uri.encodeComponent(username)}');
    }
  }

  @override
  Widget build(BuildContext context) {
    final messaging = AppScope.of(context).messaging;
    final colors = DayliColors.of(context);
    return AnimatedBuilder(
      animation: messaging,
      builder: (context, _) {
        final conversations = _folder == _MessageFolder.messages
            ? messaging.inbox
            : messaging.requests;
        return RefreshIndicator(
          onRefresh: messaging.refreshInbox,
          child: ListView(
            key: const Key('messages.inbox'),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 100),
            children: [
              Text(
                'messages',
                textAlign: TextAlign.center,
                style: DayliText.serif(
                  context,
                  fontSize: 36,
                  weight: FontWeight.w600,
                  tracking: DayliTracking.tighter,
                ),
              ),
              Center(
                child: TextButton(
                  key: const Key('messages.new'),
                  onPressed: _startConversation,
                  child: Text(
                    'New message',
                    style: DayliText.sans(
                      context,
                      size: DayliTextSize.sm,
                      weight: FontWeight.w600,
                      color: colors.foregroundSecondary,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 13),
              _MessageTabs(
                selected: _folder,
                inboxUnread: messaging.inboxUnread,
                requestUnread: messaging.requestUnread,
                onChanged: (folder) => setState(() => _folder = folder),
              ),
              const SizedBox(height: 18),
              if (messaging.failure != null)
                _PausedNotice(onRetry: messaging.refreshInbox),
              if (messaging.loading)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 72),
                  child: Center(
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                )
              else if (messaging.failure == null && conversations.isEmpty)
                _EmptyInbox(requests: _folder == _MessageFolder.requests)
              else
                ...conversations.map(
                  (conversation) => _ConversationRow(
                    conversation: conversation,
                    requests: _folder == _MessageFolder.requests,
                    onResolve: (decision) =>
                        messaging.resolveRequest(conversation.id, decision),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

enum _MessageFolder { messages, requests }

class _MessageTabs extends StatelessWidget {
  const _MessageTabs({
    required this.selected,
    required this.inboxUnread,
    required this.requestUnread,
    required this.onChanged,
  });

  final _MessageFolder selected;
  final int inboxUnread;
  final int requestUnread;
  final ValueChanged<_MessageFolder> onChanged;

  @override
  Widget build(BuildContext context) => Material(
    color: Colors.transparent,
    child: Row(
      children: [
        Expanded(
          child: _MessageTab(
            label: 'Messages',
            count: inboxUnread,
            selected: selected == _MessageFolder.messages,
            onTap: () => onChanged(_MessageFolder.messages),
          ),
        ),
        Expanded(
          child: _MessageTab(
            label: 'Requests',
            count: requestUnread,
            selected: selected == _MessageFolder.requests,
            onTap: () => onChanged(_MessageFolder.requests),
          ),
        ),
      ],
    ),
  );
}

class _MessageTab extends StatelessWidget {
  const _MessageTab({
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Semantics(
      button: true,
      selected: selected,
      label: count == 0 ? label : '$label $count',
      child: InkWell(
        key: Key('messages.tab.${label.toLowerCase()}'),
        onTap: onTap,
        child: Container(
          height: 50,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: selected ? colors.accent : colors.foreground,
                width: selected ? 4 : 2,
              ),
            ),
          ),
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label,
                  style: DayliText.sans(
                    context,
                    size: DayliTextSize.xl,
                    weight: FontWeight.w500,
                    color: selected
                        ? colors.foreground
                        : colors.foregroundSecondary,
                  ),
                ),
                if (count > 0) ...[
                  const SizedBox(width: 7),
                  Container(
                    constraints: const BoxConstraints(minWidth: 20),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: colors.foregroundAccent,
                      borderRadius: BorderRadius.circular(12),
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
    );
  }
}

class _ConversationRow extends StatelessWidget {
  const _ConversationRow({
    required this.conversation,
    required this.requests,
    required this.onResolve,
  });

  final MessagingConversation conversation;
  final bool requests;
  final ValueChanged<String> onResolve;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final name = conversation.peerName.trim().isEmpty
        ? 'conversation'
        : conversation.peerName;
    final initial = name.substring(0, 1).toUpperCase();
    final date = conversationListDate(conversation);
    return Container(
      key: Key('messages.conversation.${conversation.id}'),
      margin: const EdgeInsets.only(bottom: 4),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => context.go('/messages/${conversation.id}'),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
            child: Column(
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    CircleAvatar(
                      radius: 23,
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
                    const SizedBox(width: 13),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: DayliText.sans(
                              context,
                              size: DayliTextSize.xl,
                              weight: FontWeight.w500,
                            ),
                          ),
                          const SizedBox(height: 1),
                          Text(
                            conversation.latestMessage?.text ??
                                'No messages yet',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: DayliText.sans(
                              context,
                              size: DayliTextSize.base,
                              color: colors.foregroundSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        if (date != null)
                          Text(
                            date,
                            style: DayliText.sans(
                              context,
                              size: DayliTextSize.sm,
                              color: colors.foregroundSecondary,
                            ),
                          ),
                        if (conversation.unreadCount > 0) ...[
                          const SizedBox(height: 5),
                          Semantics(
                            container: true,
                            label:
                                '${conversation.unreadCount} unread messages',
                            child: Container(
                              key: Key('messages.unread.${conversation.id}'),
                              constraints: const BoxConstraints(minWidth: 20),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: colors.foregroundAccent,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Text(
                                '${conversation.unreadCount}',
                                textAlign: TextAlign.center,
                                style: DayliText.sans(
                                  context,
                                  size: DayliTextSize.xs,
                                  weight: FontWeight.w600,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
                if (requests && conversation.canResolveRequest)
                  Padding(
                    padding: const EdgeInsets.only(top: 10, left: 59),
                    child: Row(
                      children: [
                        _RequestAction(
                          label: 'Accept',
                          onPressed: () => onResolve('accept'),
                        ),
                        const SizedBox(width: 8),
                        _RequestAction(
                          label: 'Decline',
                          muted: true,
                          onPressed: () => onResolve('decline'),
                        ),
                      ],
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

class _RequestAction extends StatelessWidget {
  const _RequestAction({
    required this.label,
    required this.onPressed,
    this.muted = false,
  });

  final String label;
  final VoidCallback onPressed;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return TextButton(
      onPressed: onPressed,
      style: TextButton.styleFrom(
        minimumSize: const Size(0, 38),
        padding: const EdgeInsets.symmetric(horizontal: 12),
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

/// WDCC displays the latest message date. Conversations without a message use
/// the server-provided conversation update timestamp when one is available.
String? conversationListDate(
  MessagingConversation conversation, {
  DateTime Function(DateTime date)? toLocal,
}) {
  final date = conversation.latestMessage?.createdAt ?? conversation.updatedAt;
  if (date == null) return null;
  final local = (toLocal ?? (value) => value.toLocal())(date);
  String pad(int value) => value.toString().padLeft(2, '0');
  return '${pad(local.day)}/${pad(local.month)}/${local.year}';
}

class _NewConversationDialog extends StatefulWidget {
  const _NewConversationDialog();

  @override
  State<_NewConversationDialog> createState() => _NewConversationDialogState();
}

class _NewConversationDialogState extends State<_NewConversationDialog> {
  SessionController? _session;
  String? _actorId;
  Future<ApiResult<FriendPage>>? _friends;
  FriendPage? _friendPage;
  bool _loadingMore = false;
  String? _moreError;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final session = AppScope.of(context).session;
    if (_session != session) {
      _session?.removeListener(_onSessionChanged);
      _session = session;
      session.addListener(_onSessionChanged);
      _friends = null;
    }
    _syncActor();
  }

  void _onSessionChanged() {
    if (!mounted) return;
    _syncActor();
    setState(() {});
  }

  void _syncActor() {
    final actorId = _session?.user?.id;
    if (_friends != null && _actorId == actorId) return;
    _actorId = actorId;
    _friendPage = null;
    _moreError = null;
    _loadingMore = false;
    _friends = AppScope.of(context).friends.loadFriends();
  }

  void _retryFriends() {
    setState(() {
      _friendPage = null;
      _friends = AppScope.of(context).friends.loadFriends();
    });
  }

  Future<void> _moreFriends() async {
    final current = _friendPage;
    final cursor = current?.nextCursor;
    if (_loadingMore || current == null || cursor == null) return;
    final actorAtStart = _actorId;
    setState(() {
      _loadingMore = true;
      _moreError = null;
    });
    ApiResult<FriendPage> result;
    try {
      result = await AppScope.of(context).friends.loadFriends(cursor: cursor);
    } catch (_) {
      result = const ApiError(ServiceUnavailable());
    }
    if (!mounted || actorAtStart != _actorId || _friendPage != current) return;
    setState(() {
      _loadingMore = false;
      if (result is ApiSuccess<FriendPage>) {
        final known = current.items.map((friend) => friend.id).toSet();
        _friendPage = FriendPage(
          items: [
            ...current.items,
            ...result.value.items.where((friend) => known.add(friend.id)),
          ],
          nextCursor: result.value.nextCursor,
          hasMore: result.value.hasMore,
        );
      } else {
        _moreError = 'Could not load more friends.';
      }
    });
  }

  @override
  void dispose() {
    _session?.removeListener(_onSessionChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('New message'),
    content: SizedBox(
      width: MediaQuery.sizeOf(context).width - 140,
      height: 320,
      child: FutureBuilder<ApiResult<FriendPage>>(
        key: ValueKey((_actorId, _friends)),
        future: _friends,
        builder: (context, snapshot) {
          if (_friendPage == null && snapshot.data is ApiSuccess<FriendPage>) {
            _friendPage = (snapshot.data! as ApiSuccess<FriendPage>).value;
          }
          if (_friendPage == null) {
            if (!snapshot.hasData && !snapshot.hasError) {
              return const Center(child: CircularProgressIndicator());
            }
            return Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Text('Could not load friends.'),
                TextButton(
                  onPressed: _retryFriends,
                  child: const Text('Retry'),
                ),
              ],
            );
          }
          return Column(
            children: [
              Expanded(
                child: _friendPage!.items.isEmpty
                    ? const Center(child: Text('No friends yet.'))
                    : ListView.builder(
                        key: const Key('messages.friendPicker'),
                        itemCount: _friendPage!.items.length,
                        itemBuilder: (context, index) {
                          final friend = _friendPage!.items[index];
                          return ListTile(
                            key: Key('messages.friend.${friend.id}'),
                            title: Text(
                              friend.displayName,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            subtitle: Text(
                              '@${friend.username}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            onTap: () {
                              if (_actorId == _session?.user?.id) {
                                Navigator.pop(context, friend.username);
                              }
                            },
                          );
                        },
                      ),
              ),
              if (_moreError != null) Text(_moreError!),
              if (_friendPage!.hasMore)
                TextButton(
                  onPressed: _loadingMore ? null : _moreFriends,
                  child: Text(
                    _loadingMore
                        ? 'Loading…'
                        : _moreError == null
                        ? 'more friends'
                        : 'Retry more friends',
                  ),
                ),
            ],
          );
        },
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
    ],
  );
}

class _PausedNotice extends StatelessWidget {
  const _PausedNotice({required this.onRetry});
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 18),
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: DayliColors.of(context).card,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(
        color: DayliColors.of(context).foreground.withValues(alpha: 0.1),
      ),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Updates are paused. Pull to refresh or try again.',
          style: DayliText.sans(context, size: DayliTextSize.sm),
        ),
        TextButton(onPressed: onRetry, child: const Text('refresh')),
      ],
    ),
  );
}

class _EmptyInbox extends StatelessWidget {
  const _EmptyInbox({required this.requests});
  final bool requests;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 72),
    child: Center(
      child: Text(
        requests ? 'No message requests.' : 'No conversations yet.',
        style: DayliText.serif(context, size: DayliTextSize.xl),
      ),
    ),
  );
}
