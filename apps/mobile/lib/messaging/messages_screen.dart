import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_failure.dart';
import '../api/friends_client.dart';
import '../app/app_scope.dart';
import '../app/theme.dart';
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
    final result = await showDialog<String>(
      context: context,
      builder: (_) => const _NewConversationDialog(),
    );
    if (mounted && result != null) context.go('/messages/$result');
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
  String? _recipientId;
  final _text = TextEditingController();
  String? _intent;
  String? _clientMessageId;
  bool _sending = false;
  Future<ApiResult<FriendPage>>? _friends;
  FriendPage? _friendPage;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _friends ??= AppScope.of(context).friends.loadFriends();
  }

  Future<void> _moreFriends() async {
    final cursor = _friendPage?.nextCursor;
    if (cursor == null) return;
    final next = await AppScope.of(context).friends.loadFriends(cursor: cursor);
    if (!mounted || next is! ApiSuccess<FriendPage>) return;
    setState(
      () => _friendPage = FriendPage(
        items: [...?_friendPage?.items, ...next.value.items],
        nextCursor: next.value.nextCursor,
        hasMore: next.value.hasMore,
      ),
    );
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  void _changed() {
    final intent = '${_recipientId ?? ''}\u0000${_text.text}';
    if (intent != _intent) {
      _intent = intent;
      _clientMessageId = null;
    }
  }

  Future<void> _send() async {
    _changed();
    final recipientId = _recipientId ?? '';
    final text = _text.text;
    if (_sending || recipientId.isEmpty || text.trim().isEmpty) return;
    final intent = _intent!;
    final clientMessageId = _clientMessageId ??= DateTime.now()
        .microsecondsSinceEpoch
        .toString();
    setState(() => _sending = true);
    final conversationId = await AppScope.of(context).messaging.createDirect(
      recipientId,
      text,
      clientMessageId: clientMessageId,
    );
    if (!mounted) return;
    setState(() => _sending = false);
    // Inputs are locked while the request is in flight. This check also keeps
    // a future implementation that permits editing from routing stale intent.
    if (conversationId != null && _intent == intent) {
      Navigator.pop(context, conversationId);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('New message'),
    content: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        FutureBuilder<ApiResult<FriendPage>>(
          future: _friends,
          builder: (context, snapshot) {
            final value = snapshot.data;
            if (_friendPage == null && value is ApiSuccess<FriendPage>) {
              _friendPage = value.value;
            }
            final friends = _friendPage?.items ?? const <FriendCard>[];
            return Column(
              children: [
                DropdownButtonFormField<String>(
                  key: const Key('messages.friendPicker'),
                  initialValue: _recipientId,
                  decoration: const InputDecoration(labelText: 'Friend'),
                  items: friends
                      .map(
                        (friend) => DropdownMenuItem(
                          value: friend.id,
                          child: Text(friend.displayName),
                        ),
                      )
                      .toList(),
                  onChanged: _sending
                      ? null
                      : (value) {
                          setState(() => _recipientId = value);
                          _changed();
                        },
                ),
                if ((_friendPage?.hasMore ?? false))
                  TextButton(
                    onPressed: _moreFriends,
                    child: const Text('more friends'),
                  ),
              ],
            );
          },
        ),
        TextField(
          key: const Key('messages.firstText'),
          controller: _text,
          enabled: !_sending,
          onChanged: (_) => _changed(),
          maxLength: 4000,
          minLines: 1,
          maxLines: 4,
          decoration: const InputDecoration(labelText: 'Message'),
        ),
      ],
    ),
    actions: [
      TextButton(
        onPressed: _sending ? null : () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
      FilledButton(
        key: const Key('messages.createDirect'),
        onPressed: _sending ? null : _send,
        child: Text(_sending ? 'Sending...' : 'Send'),
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
