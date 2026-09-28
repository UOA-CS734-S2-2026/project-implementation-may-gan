import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app/app_scope.dart';
import '../app/theme.dart';

class MessagesScreen extends StatefulWidget {
  const MessagesScreen({super.key});

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
    final recipient = TextEditingController();
    final text = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('New message'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              key: const Key('messages.recipientId'),
              controller: recipient,
              decoration: const InputDecoration(
                labelText: 'Profile or user ID',
              ),
            ),
            TextField(
              key: const Key('messages.firstText'),
              controller: text,
              maxLength: 4000,
              minLines: 1,
              maxLines: 4,
              decoration: const InputDecoration(labelText: 'Message'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          FilledButton(
            key: const Key('messages.createDirect'),
            onPressed: () async {
              final id = await AppScope.of(context).messaging.createDirect(
                recipient.text.trim(),
                text.text,
                clientMessageId: DateTime.now().microsecondsSinceEpoch
                    .toString(),
              );
              if (dialogContext.mounted && id != null) {
                Navigator.pop(dialogContext, id);
              }
            },
            child: const Text('Send'),
          ),
        ],
      ),
    );
    recipient.dispose();
    text.dispose();
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
