import '../weather/post_weather.dart';

/// Who can read a post once it is released.
enum PostAudience {
  friends('friends'),
  solo('solo');

  const PostAudience(this.wireValue);

  final String wireValue;

  /// Null when the stored value is absent or unknown, so the author chooses
  /// again rather than posting to an audience they did not pick.
  static PostAudience? fromWire(Object? value) {
    for (final audience in values) {
      if (audience.wireValue == value) return audience;
    }
    return null;
  }
}

/// Where an attachment is in the upload flow.
enum AttachmentUploadStatus {
  /// Not uploaded yet, or interrupted before the server received it.
  pending,

  /// Reserved and possibly sent. On restart, ask the server before
  /// reserving again.
  uploading,

  /// The server checked the upload. Only validated attachments can be posted.
  validated,

  /// The server rejected the upload. The author can replace the file.
  failed;

  /// Unknown values fall back to [pending], which retries the upload rather
  /// than trusting a status this build does not understand.
  static AttachmentUploadStatus fromWire(Object? value) {
    for (final status in values) {
      if (status.name == value) return status;
    }
    return pending;
  }
}

/// A locally chosen attachment and, once the upload starts, its compressed
/// copy and server reservation. The upload fields are optional and omitted
/// from JSON until set, so drafts saved before uploads existed still load
/// and the storage format stays at version 1.
///
/// Never store the presigned upload URL here: it is a short-lived credential.
class DraftAttachment {
  const DraftAttachment({
    required this.localPath,
    required this.mediaType,
    this.compressedPath,
    this.contentType,
    this.byteSize,
    this.reservationId,
    this.status = AttachmentUploadStatus.pending,
    this.failureReason,
    this.durationMs,
    this.waveform,
  });

  /// The file the author picked.
  final String localPath;

  /// `image`, `video` or `audio` (a voice memo).
  final String mediaType;

  /// The compressed copy in app support storage, which is what gets uploaded.
  final String? compressedPath;

  /// The MIME type of the compressed copy, as sent to the server.
  final String? contentType;

  /// The compressed copy's size in bytes, as reserved with the server.
  final int? byteSize;
  final String? reservationId;
  final AttachmentUploadStatus status;

  /// The server's `failureReason` when [status] is `failed`.
  final String? failureReason;

  /// How long a voice memo plays, in milliseconds. Voice memos only.
  final int? durationMs;

  /// The loudness of a voice memo over time, a few dozen values from 0 to 255,
  /// to draw while the author listens back. Never uploaded. Voice memos only.
  final List<int>? waveform;

  bool get isVoiceMemo => mediaType == voiceMemoMediaType;

  /// The [mediaType] of a recorded voice memo.
  static const voiceMemoMediaType = 'audio';

  DraftAttachment copyWith({
    String? compressedPath,
    String? contentType,
    int? byteSize,
    String? Function()? reservationId,
    AttachmentUploadStatus? status,
    String? Function()? failureReason,
  }) => DraftAttachment(
    localPath: localPath,
    mediaType: mediaType,
    compressedPath: compressedPath ?? this.compressedPath,
    contentType: contentType ?? this.contentType,
    byteSize: byteSize ?? this.byteSize,
    reservationId: reservationId == null ? this.reservationId : reservationId(),
    status: status ?? this.status,
    failureReason: failureReason == null ? this.failureReason : failureReason(),
    durationMs: durationMs,
    waveform: waveform,
  );

  /// The same attachment with the server's reservation and result forgotten, so
  /// the upload starts again from the compressed copy. Everything else is kept,
  /// including what is known only about a voice memo (its length and waveform),
  /// because this copies the attachment and resets only the upload state.
  DraftAttachment withoutReservation() => copyWith(
    reservationId: () => null,
    status: AttachmentUploadStatus.pending,
    failureReason: () => null,
  );

  /// The same picked file with no upload state, to start over from
  /// compression. A recorded voice memo is never compressed, so it keeps what
  /// the recorder wrote and only forgets the server's reservation.
  DraftAttachment restarted() => isVoiceMemo
      ? withoutReservation()
      : DraftAttachment(localPath: localPath, mediaType: mediaType);

  /// Attachments compare by value: a draft reloaded from storage holds new
  /// instances of the same attachments.
  @override
  bool operator ==(Object other) =>
      other is DraftAttachment &&
      other.localPath == localPath &&
      other.mediaType == mediaType &&
      other.compressedPath == compressedPath &&
      other.contentType == contentType &&
      other.byteSize == byteSize &&
      other.reservationId == reservationId &&
      other.status == status &&
      other.failureReason == failureReason &&
      other.durationMs == durationMs &&
      _sameWaveform(other.waveform, waveform);

  @override
  int get hashCode => Object.hash(
    localPath,
    mediaType,
    compressedPath,
    contentType,
    byteSize,
    reservationId,
    status,
    failureReason,
    durationMs,
    waveform == null ? null : Object.hashAll(waveform!),
  );

  static bool _sameWaveform(List<int>? a, List<int>? b) {
    if (a == null || b == null) return a == b;
    if (a.length != b.length) return false;
    for (var index = 0; index < a.length; index++) {
      if (a[index] != b[index]) return false;
    }
    return true;
  }

  Map<String, Object?> toJson() => {
    'localPath': localPath,
    'mediaType': mediaType,
    if (compressedPath != null) 'compressedPath': compressedPath,
    if (contentType != null) 'contentType': contentType,
    if (byteSize != null) 'byteSize': byteSize,
    if (reservationId != null) 'reservationId': reservationId,
    if (status != AttachmentUploadStatus.pending) 'status': status.name,
    if (failureReason != null) 'failureReason': failureReason,
    if (durationMs != null) 'durationMs': durationMs,
    if (waveform != null) 'waveform': waveform,
  };

  /// Returns null without a usable path and media type. Malformed upload
  /// fields are dropped individually, so the worst case is a fresh upload.
  static DraftAttachment? fromJson(Object? json) {
    if (json is! Map<String, Object?>) return null;
    final localPath = json['localPath'];
    final mediaType = json['mediaType'];
    if (localPath is! String || mediaType is! String) return null;
    String? text(String key) {
      final value = json[key];
      return value is String && value.isNotEmpty ? value : null;
    }

    final byteSize = json['byteSize'];
    final durationMs = json['durationMs'];
    final peaks = json['waveform'];
    final reservationId = text('reservationId');
    // Every status past pending refers to a reservation. Without one there is
    // nothing to resume or link, so upload again.
    final status = reservationId == null
        ? AttachmentUploadStatus.pending
        : AttachmentUploadStatus.fromWire(json['status']);
    return DraftAttachment(
      localPath: localPath,
      mediaType: mediaType,
      compressedPath: text('compressedPath'),
      contentType: text('contentType'),
      byteSize: byteSize is int && byteSize > 0 ? byteSize : null,
      reservationId: reservationId,
      status: status,
      failureReason: status == AttachmentUploadStatus.failed
          ? text('failureReason')
          : null,
      durationMs: durationMs is int && durationMs > 0 ? durationMs : null,
      // Anything that isn't a list of 0-255 integers is dropped, which only
      // costs the picture: the memo still plays.
      waveform:
          peaks is List && peaks.every((v) => v is int && v >= 0 && v <= 255)
          ? List<int>.unmodifiable(peaks.cast<int>())
          : null,
    );
  }
}

/// An unfinished daily post. It belongs to one user and one Auckland day, and
/// carries the idempotency key reused for every submission retry.
class DailyPostDraft {
  const DailyPostDraft({
    required this.userId,
    required this.localDate,
    required this.promptId,
    required this.promptText,
    required this.idempotencyKey,
    required this.updatedAt,
    this.reflectiveAnswer = '',
    this.caption = '',
    this.rating,
    this.audience,
    this.tomorrowNote = '',
    this.attachments = const [],
    this.weather,
  });

  static const schemaVersion = 1;

  final String userId;
  final String localDate;
  final String promptId;

  /// Kept with the draft so the composer can show the prompt offline.
  final String promptText;
  final String idempotencyKey;
  final DateTime updatedAt;
  final String reflectiveAnswer;
  final String caption;
  final int? rating;

  /// Unset until the author chooses; there is deliberately no default.
  final PostAudience? audience;
  final String tomorrowNote;
  final List<DraftAttachment> attachments;

  /// The weather the author added, or null. It holds a condition, a
  /// temperature and a place name, never coordinates. Like [audience] it does
  /// not make an otherwise empty draft worth keeping.
  final PostWeather? weather;

  bool get isEmpty =>
      reflectiveAnswer.trim().isEmpty &&
      caption.trim().isEmpty &&
      rating == null &&
      tomorrowNote.trim().isEmpty &&
      attachments.isEmpty;

  DailyPostDraft copyWith({
    String? promptId,
    String? promptText,
    String? idempotencyKey,
    DateTime? updatedAt,
    String? reflectiveAnswer,
    String? caption,
    int? Function()? rating,
    PostAudience? audience,
    String? tomorrowNote,
    List<DraftAttachment>? attachments,
    PostWeather? Function()? weather,
  }) => DailyPostDraft(
    userId: userId,
    localDate: localDate,
    promptId: promptId ?? this.promptId,
    promptText: promptText ?? this.promptText,
    idempotencyKey: idempotencyKey ?? this.idempotencyKey,
    updatedAt: updatedAt ?? this.updatedAt,
    reflectiveAnswer: reflectiveAnswer ?? this.reflectiveAnswer,
    caption: caption ?? this.caption,
    rating: rating == null ? this.rating : rating(),
    audience: audience ?? this.audience,
    tomorrowNote: tomorrowNote ?? this.tomorrowNote,
    attachments: attachments ?? this.attachments,
    weather: weather == null ? this.weather : weather(),
  );

  Map<String, Object?> toJson() => {
    'version': schemaVersion,
    'userId': userId,
    'localDate': localDate,
    'promptId': promptId,
    'promptText': promptText,
    'idempotencyKey': idempotencyKey,
    'updatedAt': updatedAt.toUtc().toIso8601String(),
    'reflectiveAnswer': reflectiveAnswer,
    'caption': caption,
    'rating': rating,
    'audience': audience?.wireValue,
    'tomorrowNote': tomorrowNote,
    'attachments': [for (final attachment in attachments) attachment.toJson()],
    if (weather != null) 'weather': weather!.toJson(),
  };

  /// Returns null for anything that is not a complete version-1 draft, so a
  /// corrupted or future-format entry is discarded rather than crashing.
  static DailyPostDraft? fromJson(Object? json) {
    if (json is! Map<String, Object?>) return null;
    if (json['version'] != schemaVersion) return null;
    final userId = json['userId'];
    final localDate = json['localDate'];
    final promptId = json['promptId'];
    final idempotencyKey = json['idempotencyKey'];
    final updatedAt = DateTime.tryParse('${json['updatedAt']}');
    if (userId is! String ||
        localDate is! String ||
        promptId is! String ||
        idempotencyKey is! String ||
        updatedAt == null) {
      return null;
    }
    final rating = json['rating'];
    final attachments = json['attachments'];
    return DailyPostDraft(
      userId: userId,
      localDate: localDate,
      promptId: promptId,
      promptText: json['promptText'] is String
          ? json['promptText'] as String
          : '',
      idempotencyKey: idempotencyKey,
      updatedAt: updatedAt,
      reflectiveAnswer: json['reflectiveAnswer'] is String
          ? json['reflectiveAnswer'] as String
          : '',
      caption: json['caption'] is String ? json['caption'] as String : '',
      rating: rating is int && rating >= 1 && rating <= 10 ? rating : null,
      audience: PostAudience.fromWire(json['audience']),
      tomorrowNote: json['tomorrowNote'] is String
          ? json['tomorrowNote'] as String
          : '',
      attachments: attachments is List
          ? attachments
                .map(DraftAttachment.fromJson)
                .whereType<DraftAttachment>()
                .toList(growable: false)
          : const [],
      // A snapshot that fails the API's limits is dropped, so a corrupted
      // entry can never make the post fail validation.
      weather: PostWeather.tryParse(json['weather']),
    );
  }
}
