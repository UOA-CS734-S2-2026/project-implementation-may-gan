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
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => AppScope.of(context).messaging.refreshInbox(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final messaging = AppScope.of(context).messaging;
    final colors = DayliColors.of(context);
    return AnimatedBuilder(
      animation: messaging,
      builder: (context, _) => RefreshIndicator(
        onRefresh: messaging.refreshInbox,
        child: ListView(
          key: const Key('messages.inbox'),
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 100),
          children: [
            Text(
              'messages',
              style: DayliText.serif(
                context,
                size: DayliTextSize.xxxxl,
                weight: FontWeight.w600,
              ),
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
            const SizedBox(height: 24),
            if (messaging.failure != null)
              _PausedNotice(onRetry: messaging.refreshInbox),
            if (!messaging.loading &&
                messaging.failure == null &&
                messaging.inbox.isEmpty)
              const _EmptyInbox(),
            ...messaging.inbox.map(
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
      ),
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
  const _EmptyInbox();
  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.symmetric(vertical: 72),
    child: Center(child: Text('No conversations yet.')),
  );
}
