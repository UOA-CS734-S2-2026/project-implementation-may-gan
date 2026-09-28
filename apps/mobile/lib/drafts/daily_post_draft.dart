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

/// A reference to a locally captured attachment. Upload and validation arrive
/// with the media issues (#22, #23); drafts already persist the references so
/// the storage format does not change when they do.
class DraftAttachment {
  const DraftAttachment({required this.localPath, required this.mediaType});

  final String localPath;
  final String mediaType;

  Map<String, Object?> toJson() => {
    'localPath': localPath,
    'mediaType': mediaType,
  };

  static DraftAttachment? fromJson(Object? json) {
    if (json is! Map<String, Object?>) return null;
    final localPath = json['localPath'];
    final mediaType = json['mediaType'];
    if (localPath is! String || mediaType is! String) return null;
    return DraftAttachment(localPath: localPath, mediaType: mediaType);
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

  bool get isEmpty =>
      reflectiveAnswer.trim().isEmpty &&
      caption.trim().isEmpty &&
      rating == null &&
      tomorrowNote.trim().isEmpty &&
      attachments.isEmpty;

  DailyPostDraft copyWith({
    String? promptId,
    String? promptText,
    DateTime? updatedAt,
    String? reflectiveAnswer,
    String? caption,
    int? Function()? rating,
    PostAudience? audience,
    String? tomorrowNote,
    List<DraftAttachment>? attachments,
  }) => DailyPostDraft(
    userId: userId,
    localDate: localDate,
    promptId: promptId ?? this.promptId,
    promptText: promptText ?? this.promptText,
    idempotencyKey: idempotencyKey,
    updatedAt: updatedAt ?? this.updatedAt,
    reflectiveAnswer: reflectiveAnswer ?? this.reflectiveAnswer,
    caption: caption ?? this.caption,
    rating: rating == null ? this.rating : rating(),
    audience: audience ?? this.audience,
    tomorrowNote: tomorrowNote ?? this.tomorrowNote,
    attachments: attachments ?? this.attachments,
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
    );
  }
}
