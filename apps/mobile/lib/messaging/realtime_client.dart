import 'dart:async';
import 'dart:math';

import 'package:web_socket_channel/web_socket_channel.dart';

import '../api/api_failure.dart';
import 'messaging_client.dart';
import 'realtime_event.dart';

abstract interface class RealtimeConnection {
  Future<void> start();
  Future<void> resume();
  Future<void> stop();
}

/// One foreground socket per authenticated app instance. REST remains the
/// authority, this socket only causes bounded durable reconciliation.
class MessagingRealtimeClient implements RealtimeConnection {
  MessagingRealtimeClient(this._client, {
    required this.onReady,
    required this.onChange,
    this.socketFactory,
    double Function()? random,
    this.schedule = Timer.new,
  }) : random = random ?? Random().nextDouble;

  final MessagingClient _client;
  final Future<void> Function() onReady;
  final Future<void> Function(ConversationChanged event) onChange;
  final WebSocketChannel Function(Uri)? socketFactory;
  final double Function() random;
  final Timer Function(Duration delay, void Function() callback) schedule;
  StreamSubscription<dynamic>? _subscription;
  WebSocketChannel? _channel;
  Timer? _reconnect;
  bool _stopped = true;
  bool _ready = false;
  int _attempt = 0;
  final List<ConversationChanged> _buffer = [];

  @override
  Future<void> start() async {
    _stopped = false;
    await _connect();
  }

  @override
  Future<void> resume() async {
    if (_stopped) return;
    if (_channel == null) await _connect();
  }

  @override
  Future<void> stop() async {
    _stopped = true;
    _ready = false;
    _buffer.clear();
    _reconnect?.cancel();
    _reconnect = null;
    await _subscription?.cancel();
    _subscription = null;
    await _channel?.sink.close();
    _channel = null;
  }

  Future<void> _connect() async {
    if (_stopped || _channel != null) return;
    final ticket = await _client.issueRealtimeTicket();
    if (_stopped) return;
    switch (ticket) {
      case ApiSuccess<RealtimeTicket>(:final value):
        final uri = Uri.parse(value.webSocketUrl).replace(
          queryParameters: {'ticket': value.ticket},
        );
        _ready = false;
        _channel = (socketFactory ?? WebSocketChannel.connect)(uri);
        _subscription = _channel!.stream.listen(
          _frame,
          onError: (_) => _disconnected(),
          onDone: _disconnected,
          cancelOnError: false,
        );
      case ApiError<RealtimeTicket>():
        _scheduleReconnect();
    }
  }

  void _frame(dynamic frame) {
    if (frame is! String) {
      _disconnected();
      return;
    }
    try {
      final event = RealtimeEvent.decode(frame);
      if (event is RealtimeReady) {
        _ready = true;
        _attempt = 0;
        unawaited(_drain());
      } else if (event is ConversationChanged) {
        if (_ready) {
          unawaited(onChange(event));
        } else {
          _buffer.add(event);
        }
      }
    } on FormatException {
      // Unknown protocol versions require a safe reconnect and REST refresh.
      _disconnected();
    }
  }

  Future<void> _drain() async {
    await onReady();
    final pending = List<ConversationChanged>.from(_buffer);
    _buffer.clear();
    for (final event in pending) {
      if (_stopped || !_ready) return;
      await onChange(event);
    }
  }

  void _disconnected() {
    if (_stopped) return;
    _ready = false;
    _channel = null;
    unawaited(_subscription?.cancel());
    _subscription = null;
    _scheduleReconnect();
  }

  void _scheduleReconnect() {
    if (_stopped || _reconnect != null) return;
    final seconds = min(30, 1 << min(_attempt++, 5));
    final delay = Duration(milliseconds: (seconds * 1000 * (0.75 + random() * .5)).round());
    _reconnect = schedule(delay, () {
      _reconnect = null;
      unawaited(_connect());
    });
  }
}
