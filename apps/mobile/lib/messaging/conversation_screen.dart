import 'package:flutter/material.dart';

import '../app/app_scope.dart';
import '../app/theme.dart';

class ConversationScreen extends StatefulWidget {
  const ConversationScreen({super.key, required this.conversationId});
  final String conversationId;

  @override
  State<ConversationScreen> createState() => _ConversationScreenState();
}

class _ConversationScreenState extends State<ConversationScreen> {
  final _composer = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => AppScope.of(
        context,
      ).messaging.loadConversation(widget.conversationId),
    );
  }

  @override
  void dispose() {
    _composer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final messaging = AppScope.of(context).messaging;
    final colors = DayliColors.of(context);
    return Scaffold(
      backgroundColor: colors.background,
      appBar: AppBar(title: const Text('conversation')),
      body: AnimatedBuilder(
        animation: messaging,
        builder: (context, _) => Column(
          children: [
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.all(20),
                itemCount: messaging.thread(widget.conversationId).length,
                itemBuilder: (context, index) {
                  final message = messaging.thread(
                    widget.conversationId,
                  )[index];
                  final mine =
                      message.senderId == AppScope.of(context).session.user?.id;
                  return Align(
                    alignment: mine
                        ? Alignment.centerRight
                        : Alignment.centerLeft,
                    child: Container(
                      constraints: const BoxConstraints(maxWidth: 300),
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: mine
                            ? colors.foregroundAccent
                            : colors.backgroundSecondary,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Text(
                        message.text ?? 'This message was unsent.',
                        style: DayliText.sans(
                          context,
                          size: DayliTextSize.sm,
                          color: mine ? Colors.white : colors.foreground,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _composer,
                        minLines: 1,
                        maxLines: 4,
                        maxLength: 4000,
                        decoration: const InputDecoration(
                          hintText: 'Write a message',
                        ),
                      ),
                    ),
                    IconButton(
                      key: const Key('messages.send'),
                      icon: const Icon(Icons.send),
                      onPressed: () async {
                        final text = _composer.text;
                        _composer.clear();
                        await messaging.send(widget.conversationId, text);
                      },
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
