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
  MessagingRealtimeClient(
    this._client, {
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
  bool _connecting = false;
  int _attempt = 0;
  int _epoch = 0;
  final List<ConversationChanged> _buffer = [];

  bool _current(int epoch) => !_stopped && epoch == _epoch;

  @override
  Future<void> start() async {
    if (!_stopped && _channel != null) return;
    _stopped = false;
    final epoch = ++_epoch;
    await _connect(epoch);
  }

  @override
  Future<void> resume() async {
    if (_stopped || _channel != null || _connecting) return;
    await _connect(_epoch);
  }

  @override
  Future<void> stop() async {
    // Invalidate every pending ticket, frame, reconnect, and ready callback
    // before awaiting subscription and socket disposal.
    ++_epoch;
    _stopped = true;
    _ready = false;
    _connecting = false;
    _buffer.clear();
    _reconnect?.cancel();
    _reconnect = null;
    await _subscription?.cancel();
    _subscription = null;
    await _channel?.sink.close();
    _channel = null;
  }

  Future<void> _connect(int epoch) async {
    if (!_current(epoch) || _channel != null || _connecting) return;
    _connecting = true;
    final ticket = await _client.issueRealtimeTicket();
    if (!_current(epoch)) return;
    _connecting = false;
    switch (ticket) {
      case ApiSuccess<RealtimeTicket>(:final value):
        final uri = Uri.parse(value.webSocketUrl)
            .replace(queryParameters: {'ticket': value.ticket});
        _ready = false;
        final channel = (socketFactory ?? WebSocketChannel.connect)(uri);
        if (!_current(epoch)) {
          await channel.sink.close();
          return;
        }
        _channel = channel;
        _subscription = channel.stream.listen(
          (frame) => _frame(epoch, frame),
          onError: (_) => _disconnected(epoch),
          onDone: () => _disconnected(epoch),
          cancelOnError: false,
        );
      case ApiError<RealtimeTicket>():
        _scheduleReconnect(epoch);
    }
  }

  void _frame(int epoch, dynamic frame) {
    if (!_current(epoch)) return;
    if (frame is! String) {
      _disconnected(epoch);
      return;
    }
    try {
      final event = RealtimeEvent.decode(frame);
      if (event is RealtimeReady) {
        _ready = true;
        _attempt = 0;
        unawaited(_drain(epoch));
      } else if (event is ConversationChanged) {
        if (_ready) {
          unawaited(onChange(event));
        } else {
          _buffer.add(event);
        }
      }
    } on FormatException {
      // Unknown protocol versions require a safe reconnect and REST refresh.
      _disconnected(epoch);
    }
  }

  Future<void> _drain(int epoch) async {
    await onReady();
    if (!_current(epoch) || !_ready) return;
    final pending = List<ConversationChanged>.from(_buffer);
    _buffer.clear();
    for (final event in pending) {
      if (!_current(epoch) || !_ready) return;
      await onChange(event);
    }
  }

  void _disconnected(int epoch) {
    if (!_current(epoch)) return;
    _ready = false;
    _channel = null;
    unawaited(_subscription?.cancel());
    _subscription = null;
    _scheduleReconnect(epoch);
  }

  void _scheduleReconnect(int epoch) {
    if (!_current(epoch) || _reconnect != null) return;
    final seconds = min(30, 1 << min(_attempt++, 5));
    final delay = Duration(
      milliseconds: (seconds * 1000 * (0.75 + random() * .5)).round(),
    );
    _reconnect = schedule(delay, () {
      _reconnect = null;
      unawaited(_connect(epoch));
    });
  }
}
