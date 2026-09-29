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
  Future<ApiResult<String?>>? _existing;
  String? _accountId;
  String? _loadedUsername;
  String? _intent;
  String? _clientMessageId;
  bool _sending = false;
  bool _redirected = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final accountId = AppScope.of(context).session.user?.id;
    if (_profile == null ||
        _accountId != accountId ||
        _loadedUsername != widget.username) {
      _accountId = accountId;
      _loadedUsername = widget.username;
      _profile = _load();
      _existing = null;
      _intent = null;
      _clientMessageId = null;
      _redirected = false;
      _sending = false;
      _text.clear();
    }
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
    final accountAtStart = _accountId;
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
    if (!mounted || accountAtStart != AppScope.of(context).session.user?.id) {
      return;
    }
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
          final accountAtLookup = _accountId;
          _existing ??= AppScope.of(context).messaging.findDirect(person.id);
          return FutureBuilder<ApiResult<String?>>(
            future: _existing,
            builder: (context, lookup) {
              final lookupResult = lookup.data;
              final existingId = lookupResult is ApiSuccess<String?>
                  ? lookupResult.value
                  : null;
              if (existingId != null &&
                  !_redirected &&
                  accountAtLookup == AppScope.of(context).session.user?.id) {
                _redirected = true;
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (mounted &&
                      accountAtLookup ==
                          AppScope.of(context).session.user?.id) {
                    context.go('/messages/$existingId');
                  }
                });
              }
              if (!lookup.hasData) {
                return const Center(child: CircularProgressIndicator());
              }
              if (lookupResult is ApiError<String?>) {
                return const Center(
                  child: Text(
                    'Conversation lookup is unavailable. Please try again.',
                  ),
                );
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
                          style: DayliText.sans(
                            context,
                            size: DayliTextSize.sm,
                          ),
                        ),
                        TextField(
                          controller: _text,
                          minLines: 3,
                          maxLines: 5,
                          maxLength: 4000,
                          enabled: !_sending,
                          decoration: const InputDecoration(
                            labelText: 'Message',
                          ),
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
            },
          );
        }
        return const Center(child: Text('This profile is unavailable.'));
      },
    ),
  );
}
