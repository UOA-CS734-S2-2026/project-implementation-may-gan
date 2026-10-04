import 'package:flutter/material.dart';

import '../app/app_scope.dart';
import '../app/theme.dart';
import 'messaging_client.dart';

class ConversationScreen extends StatefulWidget {
  const ConversationScreen({super.key, required this.conversationId});
  final String conversationId;

  @override
  State<ConversationScreen> createState() => _ConversationScreenState();
}

class _ConversationScreenState extends State<ConversationScreen> {
  final _composer = TextEditingController();
  String? _retryClientMessageId;
  String? _retryText;
  MessagingMessage? _replyingTo;
  MessagingMessage? _editing;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadAndRead());
  }

  Future<void> _loadAndRead() async {
    final messaging = AppScope.of(context).messaging;
    await messaging.loadConversation(widget.conversationId);
    if (!mounted) return;
    await _markVisibleRead();
  }

  Future<void> _markVisibleRead() async {
    final messages = AppScope.of(context).messaging
        .thread(widget.conversationId);
    if (messages.isNotEmpty) {
      await AppScope.of(context).messaging
          .markRead(widget.conversationId, messages.last.sequence);
    }
  }

  @override
  void dispose() {
    _composer.dispose();
    super.dispose();
  }

  bool _canEdit(
    MessagingMessage message,
    String? actorId,
    MessagingConversation? conversation,
  ) =>
      conversation?.canSend == true &&
      message.senderId == actorId &&
      message.unsentAt == null &&
      DateTime.now().toUtc().isBefore(
        message.createdAt.toUtc().add(const Duration(minutes: 15)),
      );

  bool _canUnsend(
    MessagingMessage message,
    String? actorId,
    MessagingConversation? conversation,
  ) =>
      conversation?.canSend == true &&
      message.senderId == actorId &&
      message.unsentAt == null;

  Future<void> _showActions(
    MessagingMessage message,
    bool mine,
    MessagingConversation? conversation,
  ) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              key: const Key('messages.action.reply'),
              enabled:
                  conversation?.canSend == true && message.unsentAt == null,
              leading: const Icon(Icons.reply),
              title: const Text('Reply'),
              onTap: () => Navigator.pop(context, 'reply'),
            ),
            ListTile(
              key: const Key('messages.action.react'),
              enabled:
                  conversation?.canSend == true && message.unsentAt == null,
              leading: const Icon(Icons.add_reaction_outlined),
              title: const Text('React'),
              onTap: () => Navigator.pop(context, 'react'),
            ),
            if (_canEdit(
              message,
              AppScope.of(this.context).session.user?.id,
              conversation,
            ))
              ListTile(
                key: const Key('messages.action.edit'),
                leading: const Icon(Icons.edit),
                title: const Text('Edit'),
                onTap: () => Navigator.pop(context, 'edit'),
              ),
            if (_canUnsend(
              message,
              AppScope.of(this.context).session.user?.id,
              conversation,
            ))
              ListTile(
                key: const Key('messages.action.unsend'),
                leading: const Icon(Icons.undo),
                title: const Text('Unsend'),
                onTap: () => Navigator.pop(context, 'unsend'),
              ),
          ],
        ),
      ),
    );
    if (!mounted || action == null) return;
    if (action == 'reply') {
      setState(() {
        _replyingTo = message;
        _editing = null;
      });
    } else if (action == 'edit') {
      setState(() {
        _editing = message;
        _replyingTo = null;
        _composer.text = message.text ?? '';
      });
    } else if (action == 'unsend') {
      await AppScope.of(context).messaging
          .unsend(widget.conversationId, message);
    } else if (action == 'react') {
      await _chooseReaction(message);
    }
  }

  Future<void> _chooseReaction(MessagingMessage message) async {
    const reactions = {
      'like': '👍',
      'love': '❤️',
      'laugh': '😂',
      'surprised': '😮',
      'sad': '😢',
      'thanks': '🙏',
    };
    final action = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Wrap(
          children: reactions.entries
              .map(
                (entry) => ListTile(
                  key: Key('messages.reaction.${entry.key}'),
                  leading: Text(entry.value),
                  title: Text(entry.key),
                  onTap: () => Navigator.pop(context, entry.key),
                ),
              )
              .toList(),
        ),
      ),
    );
    if (!mounted || action == null) return;
    final current = message.reactions
        .where((item) => item.reactedByActor)
        .firstOrNull;
    if (current?.reaction == action) {
      await AppScope.of(context).messaging
          .removeReaction(widget.conversationId, message);
    } else {
      await AppScope.of(context).messaging
          .setReaction(widget.conversationId, message, action);
    }
  }

  Future<void> _send() async {
    final text = _composer.text;
    if (text.trim().isEmpty || _sending) return;
    final messaging = AppScope.of(context).messaging;
    final conversation = messaging.conversation(widget.conversationId);
    if (conversation?.canSend != true) return;
    setState(() => _sending = true);
    final editing = _editing;
    final replyingTo = _replyingTo;
    _retryText = text;
    final sent = editing == null
        ? await messaging.send(
            widget.conversationId,
            text,
            clientMessageId: _retryClientMessageId ??= DateTime.now()
                .microsecondsSinceEpoch
                .toString(),
            replyToMessageId: replyingTo?.id,
          )
        : await messaging.edit(widget.conversationId, editing, text);
    if (!mounted) return;
    setState(() {
      _sending = false;
      if (sent) {
        _composer.clear();
        _retryClientMessageId = null;
        _retryText = null;
        _replyingTo = null;
        _editing = null;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final messaging = AppScope.of(context).messaging;
    final colors = DayliColors.of(context);
    final actorId = AppScope.of(context).session.user?.id;
    return Scaffold(
      backgroundColor: colors.background,
      appBar: AppBar(
        title: Text(
          messaging.conversation(widget.conversationId)?.peerName ??
              'conversation',
        ),
      ),
      body: AnimatedBuilder(
        animation: messaging,
        builder: (context, _) {
          final conversation = messaging.conversation(widget.conversationId);
          final messages = messaging.thread(widget.conversationId);
          final receiptMessage = messages
              .where(
                (item) =>
                    item.senderId == actorId &&
                    BigInt.parse(item.sequence) <=
                        BigInt.parse(conversation?.receiptSequence ?? '0'),
              )
              .lastOrNull;
          return Column(
            children: [
              if (conversation?.requestState == 'pending')
                _RequestBanner(
                  conversationId: widget.conversationId,
                  canResolve: conversation?.canResolveRequest == true,
                ),
              if (conversation != null &&
                  !conversation.canSend &&
                  conversation.requestState != 'pending')
                const _UnavailableActionsNotice(),
              Expanded(
                child: RefreshIndicator(
                  onRefresh: _loadAndRead,
                  child: ListView.builder(
                    key: const Key('messages.thread'),
                    padding: const EdgeInsets.all(20),
                    itemCount:
                        messages.length +
                        (messaging.hasOlder(widget.conversationId) ? 1 : 0),
                    itemBuilder: (context, index) {
                      if (messaging.hasOlder(widget.conversationId) &&
                          index == 0) {
                        return Center(
                          child: TextButton(
                            key: const Key('messages.loadOlder'),
                            onPressed: () =>
                                messaging.loadOlder(widget.conversationId),
                            child: const Text('Load earlier messages'),
                          ),
                        );
                      }
                      final message =
                          messages[index -
                              (messaging.hasOlder(widget.conversationId)
                                  ? 1
                                  : 0)];
                      final mine = message.senderId == actorId;
                      return _MessageBubble(
                        message: message,
                        mine: mine,
                        seen: receiptMessage?.id == message.id,
                        onTap: () => _showActions(message, mine, conversation),
                      );
                    },
                  ),
                ),
              ),
              if (_replyingTo != null || _editing != null)
                _ComposerMode(
                  message: _replyingTo ?? _editing!,
                  editing: _editing != null,
                  onCancel: () => setState(() {
                    _replyingTo = null;
                    _editing = null;
                    _composer.clear();
                  }),
                ),
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          key: const Key('messages.composer'),
                          controller: _composer,
                          enabled: conversation?.canSend == true,
                          onChanged: (value) {
                            if (_retryClientMessageId != null &&
                                value != _retryText) {
                              _retryClientMessageId = null;
                              _retryText = null;
                            }
                          },
                          minLines: 1,
                          maxLines: 4,
                          maxLength: 4000,
                          decoration: InputDecoration(
                            hintText: conversation?.canSend == true
                                ? (_editing == null
                                      ? 'Write a message'
                                      : 'Edit message')
                                : 'Messaging is unavailable',
                          ),
                        ),
                      ),
                      IconButton(
                        key: const Key('messages.send'),
                        tooltip: _editing == null ? 'Send' : 'Save edit',
                        icon: Icon(_editing == null ? Icons.send : Icons.check),
                        onPressed: _sending || conversation?.canSend != true
                            ? null
                            : _send,
                      ),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _RequestBanner extends StatelessWidget {
  const _RequestBanner({
    required this.conversationId,
    required this.canResolve,
  });
  final String conversationId;
  final bool canResolve;
  @override
  Widget build(BuildContext context) => MaterialBanner(
    content: Text(
      canResolve
          ? 'Accept this message request to reply.'
          : 'This message request is awaiting a response.',
    ),
    actions: canResolve
        ? [
            TextButton(
              key: const Key('messages.declineRequest'),
              onPressed: () =>
                  AppScope.of(context).messaging
                      .resolveRequest(conversationId, 'decline'),
              child: const Text('Decline'),
            ),
            FilledButton(
              key: const Key('messages.acceptRequest'),
              onPressed: () =>
                  AppScope.of(context).messaging
                      .resolveRequest(conversationId, 'accept'),
              child: const Text('Accept'),
            ),
          ]
        : const [],
  );
}

class _UnavailableActionsNotice extends StatelessWidget {
  const _UnavailableActionsNotice();
  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.all(12),
    child: Text('Messaging actions are unavailable for this conversation.'),
  );
}

class _ComposerMode extends StatelessWidget {
  const _ComposerMode({
    required this.message,
    required this.editing,
    required this.onCancel,
  });
  final MessagingMessage message;
  final bool editing;
  final VoidCallback onCancel;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
    color: Theme.of(context).colorScheme.surfaceContainerHighest,
    child: Row(
      children: [
        Expanded(
          child: Text(
            editing
                ? 'Editing: ${message.text ?? 'Message removed'}'
                : 'Replying to: ${message.text ?? 'Message removed'}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        IconButton(onPressed: onCancel, icon: const Icon(Icons.close)),
      ],
    ),
  );
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({
    required this.message,
    required this.mine,
    required this.seen,
    required this.onTap,
  });
  final MessagingMessage message;
  final bool mine;
  final bool seen;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Column(
        crossAxisAlignment: mine
            ? CrossAxisAlignment.end
            : CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onLongPress: onTap,
            onTap: onTap,
            child: Container(
              constraints: const BoxConstraints(maxWidth: 300),
              margin: const EdgeInsets.only(bottom: 3),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: mine
                    ? colors.foregroundAccent
                    : colors.backgroundSecondary,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (message.replyPreview != null)
                    Container(
                      padding: const EdgeInsets.only(left: 8, bottom: 6),
                      decoration: BoxDecoration(
                        border: Border(
                          left: BorderSide(
                            color: mine
                                ? Colors.white70
                                : colors.foregroundSecondary,
                            width: 2,
                          ),
                        ),
                      ),
                      child: Text(
                        message.replyPreview!.text ?? 'Message removed',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: mine
                              ? Colors.white70
                              : colors.foregroundSecondary,
                        ),
                      ),
                    ),
                  Text(
                    message.text ?? 'This message was unsent.',
                    style: DayliText.sans(
                      context,
                      size: DayliTextSize.sm,
                      color: mine ? Colors.white : colors.foreground,
                    ),
                  ),
                  if (message.editedAt != null && message.unsentAt == null)
                    Text(
                      'Edited',
                      style: TextStyle(
                        fontSize: 11,
                        color: mine
                            ? Colors.white70
                            : colors.foregroundSecondary,
                      ),
                    ),
                ],
              ),
            ),
          ),
          if (message.reactions.isNotEmpty)
            Wrap(
              spacing: 4,
              children: message.reactions
                  .map(
                    (item) => Chip(
                      label: Text(
                        '${_reactionEmoji(item.reaction)} ${item.count}',
                      ),
                    ),
                  )
                  .toList(),
            ),
          if (seen)
            const Padding(
              padding: EdgeInsets.only(bottom: 8),
              child: Text('Seen', style: TextStyle(fontSize: 11)),
            ),
        ],
      ),
    );
  }
}

String _reactionEmoji(String value) =>
    const {
      'like': '👍',
      'love': '❤️',
      'laugh': '😂',
      'surprised': '😮',
      'sad': '😢',
      'thanks': '🙏',
    }[value] ??
    value;
