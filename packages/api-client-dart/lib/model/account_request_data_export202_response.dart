//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AccountRequestDataExport202Response {
  /// Returns a new [AccountRequestDataExport202Response] instance.
  AccountRequestDataExport202Response({
    required this.id,
    required this.status,
    required this.requestedAt,
    required this.readyAt,
    required this.expiresAt,
    required this.downloadable,
  });

  final String id;

  final AccountRequestDataExport202ResponseStatusEnum status;

  final DateTime requestedAt;

  final DateTime? readyAt;

  final DateTime? expiresAt;

  final bool downloadable;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AccountRequestDataExport202Response &&
          other.id == id &&
          other.status == status &&
          other.requestedAt == requestedAt &&
          other.readyAt == readyAt &&
          other.expiresAt == expiresAt &&
          other.downloadable == downloadable;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (id.hashCode) +
      (status.hashCode) +
      (requestedAt.hashCode) +
      (readyAt.hashCode) +
      (expiresAt.hashCode) +
      (downloadable.hashCode);

  @override
  String toString() =>
      'AccountRequestDataExport202Response[id=$id, status=$status, requestedAt=$requestedAt, readyAt=$readyAt, expiresAt=$expiresAt, downloadable=$downloadable]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'id'] = this.id;
    json[r'status'] = this.status;
    json[r'requestedAt'] = this.requestedAt.toUtc().toIso8601String();
    json[r'readyAt'] =
        this.readyAt == null ? null : this.readyAt!.toUtc().toIso8601String();
    json[r'expiresAt'] = this.expiresAt == null
        ? null
        : this.expiresAt!.toUtc().toIso8601String();
    json[r'downloadable'] = this.downloadable;
    return json;
  }

  /// Clones this instance of [AccountRequestDataExport202Response] and returns a new one where some of the
  /// properties have changed.
  AccountRequestDataExport202Response copyWith({
    String? id,
    AccountRequestDataExport202ResponseStatusEnum? status,
    DateTime? requestedAt,
    DateTime? readyAt,
    DateTime? expiresAt,
    bool? downloadable,
  }) =>
      AccountRequestDataExport202Response(
        id: id ?? this.id,
        status: status ?? this.status,
        requestedAt: requestedAt ?? this.requestedAt,
        readyAt: readyAt ?? this.readyAt,
        expiresAt: expiresAt ?? this.expiresAt,
        downloadable: downloadable ?? this.downloadable,
      );

  /// Returns a new [AccountRequestDataExport202Response] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AccountRequestDataExport202Response? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "AccountRequestDataExport202Response[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "AccountRequestDataExport202Response[id]" has a null value in JSON.');
        assert(json.containsKey(r'status'),
            'Required key "AccountRequestDataExport202Response[status]" is missing from JSON.');
        assert(json[r'status'] != null,
            'Required key "AccountRequestDataExport202Response[status]" has a null value in JSON.');
        assert(json.containsKey(r'requestedAt'),
            'Required key "AccountRequestDataExport202Response[requestedAt]" is missing from JSON.');
        assert(json[r'requestedAt'] != null,
            'Required key "AccountRequestDataExport202Response[requestedAt]" has a null value in JSON.');
        assert(json.containsKey(r'readyAt'),
            'Required key "AccountRequestDataExport202Response[readyAt]" is missing from JSON.');
        assert(json.containsKey(r'expiresAt'),
            'Required key "AccountRequestDataExport202Response[expiresAt]" is missing from JSON.');
        assert(json.containsKey(r'downloadable'),
            'Required key "AccountRequestDataExport202Response[downloadable]" is missing from JSON.');
        assert(json[r'downloadable'] != null,
            'Required key "AccountRequestDataExport202Response[downloadable]" has a null value in JSON.');
        return true;
      }());

      return AccountRequestDataExport202Response(
        id: mapValueOfType<String>(json, r'id')!,
        status: AccountRequestDataExport202ResponseStatusEnum.fromJson(
            json[r'status'])!,
        requestedAt: mapDateTime(json, r'requestedAt', r'')!,
        readyAt: mapDateTime(json, r'readyAt', r''),
        expiresAt: mapDateTime(json, r'expiresAt', r''),
        downloadable: mapValueOfType<bool>(json, r'downloadable')!,
      );
    }
    return null;
  }

  static List<AccountRequestDataExport202Response> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountRequestDataExport202Response>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AccountRequestDataExport202Response.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AccountRequestDataExport202Response> mapFromJson(
      dynamic json) {
    final map = <String, AccountRequestDataExport202Response>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AccountRequestDataExport202Response.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AccountRequestDataExport202Response-objects as value to a dart map
  static Map<String, List<AccountRequestDataExport202Response>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<AccountRequestDataExport202Response>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AccountRequestDataExport202Response.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'id',
    'status',
    'requestedAt',
    'readyAt',
    'expiresAt',
    'downloadable',
  };
}

enum AccountRequestDataExport202ResponseStatusEnum {
  requested._(r'requested'),
  building._(r'building'),
  ready._(r'ready'),
  failed._(r'failed'),
  cancelled._(r'cancelled'),
  expired._(r'expired'),
  ;

  /// Instantiate a new enum with the provided value.
  const AccountRequestDataExport202ResponseStatusEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [AccountRequestDataExport202ResponseStatusEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static AccountRequestDataExport202ResponseStatusEnum? fromJson(
          dynamic value) =>
      AccountRequestDataExport202ResponseStatusEnumTypeTransformer()
          .decode(value);

  /// Returns a [List] containing instances of [AccountRequestDataExport202ResponseStatusEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<AccountRequestDataExport202ResponseStatusEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountRequestDataExport202ResponseStatusEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value =
            AccountRequestDataExport202ResponseStatusEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AccountRequestDataExport202ResponseStatusEnum] to String,
/// and [decode] dynamic data back to [AccountRequestDataExport202ResponseStatusEnum].
class AccountRequestDataExport202ResponseStatusEnumTypeTransformer {
  factory AccountRequestDataExport202ResponseStatusEnumTypeTransformer() =>
      _instance ??=
          const AccountRequestDataExport202ResponseStatusEnumTypeTransformer
              ._();

  const AccountRequestDataExport202ResponseStatusEnumTypeTransformer._();

  String encode(AccountRequestDataExport202ResponseStatusEnum data) =>
      data._value;

  /// Returns the instance of [AccountRequestDataExport202ResponseStatusEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AccountRequestDataExport202ResponseStatusEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is AccountRequestDataExport202ResponseStatusEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'requested':
          return AccountRequestDataExport202ResponseStatusEnum.requested;
        case r'building':
          return AccountRequestDataExport202ResponseStatusEnum.building;
        case r'ready':
          return AccountRequestDataExport202ResponseStatusEnum.ready;
        case r'failed':
          return AccountRequestDataExport202ResponseStatusEnum.failed;
        case r'cancelled':
          return AccountRequestDataExport202ResponseStatusEnum.cancelled;
        case r'expired':
          return AccountRequestDataExport202ResponseStatusEnum.expired;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static AccountRequestDataExport202ResponseStatusEnumTypeTransformer?
      _instance;
}
