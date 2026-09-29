import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_failure.dart';
import '../api/friends_client.dart';
import '../app/app_scope.dart';
import '../app/theme.dart';

class MessagesScreen extends StatefulWidget {
  const MessagesScreen({super.key, this.recipientId, this.recipientName});
  final String? recipientId;
  final String? recipientName;

  @override
  State<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends State<MessagesScreen> {
  var _folder = 'inbox';

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
      builder: (_) => _NewConversationDialog(
        recipientId: widget.recipientId,
        recipientName: widget.recipientName,
      ),
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
        final conversations = _folder == 'inbox'
            ? messaging.inbox
            : messaging.requests;
        return RefreshIndicator(
          onRefresh: messaging.refreshInbox,
          child: ListView(
            key: const Key('messages.inbox'),
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 100),
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'messages',
                      style: DayliText.serif(
                        context,
                        size: DayliTextSize.xxxxl,
                        weight: FontWeight.w600,
                      ),
                    ),
                  ),
                  IconButton(
                    key: const Key('messages.new'),
                    tooltip: 'New message',
                    onPressed: _startConversation,
                    icon: const Icon(Icons.edit_square),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                'private notes',
                style: DayliText.sans(
                  context,
                  size: DayliTextSize.sm,
                  color: colors.foregroundSecondary,
                ),
              ),
              const SizedBox(height: 18),
              SegmentedButton<String>(
                segments: [
                  ButtonSegment(
                    value: 'inbox',
                    label: Text(
                      'Inbox${messaging.inboxUnread == 0 ? '' : ' (${messaging.inboxUnread})'}',
                    ),
                  ),
                  ButtonSegment(
                    value: 'requests',
                    label: Text(
                      'Requests${messaging.requestUnread == 0 ? '' : ' (${messaging.requestUnread})'}',
                    ),
                  ),
                ],
                selected: {_folder},
                onSelectionChanged: (value) =>
                    setState(() => _folder = value.first),
              ),
              const SizedBox(height: 18),
              if (messaging.failure != null)
                _PausedNotice(onRetry: messaging.refreshInbox),
              if (!messaging.loading &&
                  messaging.failure == null &&
                  conversations.isEmpty)
                _EmptyInbox(requests: _folder == 'requests'),
              ...conversations.map(
                (conversation) => Card(
                  elevation: 0,
                  color: colors.card,
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    key: Key('messages.conversation.${conversation.id}'),
                    onTap: () => context.go('/messages/${conversation.id}'),
                    leading: CircleAvatar(
                      backgroundColor: colors.backgroundAccent,
                      child: Text(
                        (conversation.peerName.isEmpty
                                ? '?'
                                : conversation.peerName.substring(0, 1))
                            .toUpperCase(),
                        style: TextStyle(color: colors.foregroundAccent),
                      ),
                    ),
                    title: Text(
                      conversation.peerName,
                      style: DayliText.serif(
                        context,
                        size: DayliTextSize.lg,
                        weight: FontWeight.w600,
                      ),
                    ),
                    subtitle: Text(
                      conversation.latestMessage?.text ?? 'Message removed',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: DayliText.sans(
                        context,
                        size: DayliTextSize.sm,
                        color: colors.foregroundSecondary,
                      ),
                    ),
                    trailing: conversation.unreadCount == 0
                        ? null
                        : Badge(label: Text('${conversation.unreadCount}')),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _NewConversationDialog extends StatefulWidget {
  const _NewConversationDialog({this.recipientId, this.recipientName});
  final String? recipientId;
  final String? recipientName;

  @override
  State<_NewConversationDialog> createState() => _NewConversationDialogState();
}

class _NewConversationDialogState extends State<_NewConversationDialog> {
  late String? _recipientId = widget.recipientId;
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
        if (widget.recipientId != null)
          Align(
            alignment: Alignment.centerLeft,
            child: Text('To: ${widget.recipientName ?? 'this person'}'),
          )
        else
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
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Updates are paused. Pull to refresh or try again.'),
          const SizedBox(height: 8),
          TextButton(onPressed: onRetry, child: const Text('refresh')),
        ],
      ),
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
      child: Text(requests ? 'No message requests.' : 'No conversations yet.'),
    ),
  );
}
