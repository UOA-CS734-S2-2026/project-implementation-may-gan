import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_failure.dart';
import '../api/friends_client.dart';
import '../app/app_scope.dart';
import '../app/theme.dart';

/// Route-backed draft. It never creates a blank conversation.
class NewMessageScreen extends StatefulWidget {
  const NewMessageScreen({super.key, required this.username});
  final String username;
  @override
  State<NewMessageScreen> createState() => _NewMessageScreenState();
}

class _NewMessageScreenState extends State<NewMessageScreen> {
  final _text = TextEditingController();
  Future<ApiResult<FriendCard>>? _profile;
  String? _intent;
  String? _clientMessageId;
  bool _sending = false;
  bool _redirected = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _profile ??= _load();
  }

  Future<ApiResult<FriendCard>> _load() {
    final client = AppScope.of(context).friends;
    return client is GeneratedFriendsClient
        ? client.profile(widget.username)
        : Future.value(const ApiError(ServiceUnavailable()));
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _send(FriendCard recipient) async {
    final text = _text.text;
    if (_sending || text.trim().isEmpty) return;
    final intent = '${recipient.id}\u0000$text';
    if (_intent != intent) {
      _intent = intent;
      _clientMessageId = null;
    }
    setState(() => _sending = true);
    final id = await AppScope.of(context).messaging.createDirect(
      recipient.id,
      text,
      clientMessageId: _clientMessageId ??= DateTime.now()
          .microsecondsSinceEpoch
          .toString(),
    );
    if (!mounted) return;
    setState(() => _sending = false);
    if (id != null) context.go('/messages/$id');
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('new message')),
    body: FutureBuilder<ApiResult<FriendCard>>(
      future: _profile,
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.data case ApiSuccess<FriendCard>(value: final person)) {
          final messaging = AppScope.of(context).messaging;
          final matches = [...messaging.inbox, ...messaging.requests]
              .where((conversation) => conversation.peerId == person.id)
              .toList(growable: false);
          final existing = matches.isEmpty ? null : matches.first;
          if (existing != null && !_redirected) {
            _redirected = true;
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) context.go('/messages/${existing.id}');
            });
          }
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: DayliColors.of(context).card,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'private note to',
                      style: DayliText.sans(
                        context,
                        size: DayliTextSize.sm,
                        color: DayliColors.of(context).foregroundTertiary,
                      ),
                    ),
                    Text(
                      person.displayName,
                      style: DayliText.serif(
                        context,
                        size: DayliTextSize.xxl,
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
                    const SizedBox(height: 16),
                    Text(
                      'Nothing is created until you send your first message.',
                      style: DayliText.sans(context, size: DayliTextSize.sm),
                    ),
                    TextField(
                      controller: _text,
                      minLines: 3,
                      maxLines: 5,
                      maxLength: 4000,
                      enabled: !_sending,
                      decoration: const InputDecoration(labelText: 'Message'),
                    ),
                    Align(
                      alignment: Alignment.centerRight,
                      child: FilledButton(
                        onPressed: _sending ? null : () => _send(person),
                        child: Text(_sending ? 'Sending…' : 'Send'),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          );
        }
        return const Center(child: Text('This profile is unavailable.'));
      },
    ),
  );
}
