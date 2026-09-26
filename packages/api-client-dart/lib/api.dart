//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

library openapi.api;

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:collection/collection.dart';
import 'package:http/http.dart';
import 'package:intl/intl.dart';
import 'package:meta/meta.dart';

part 'api_client.dart';
part 'api_helper.dart';
part 'api_exception.dart';
part 'auth/authentication.dart';
part 'auth/api_key_auth.dart';
part 'auth/oauth.dart';
part 'auth/http_basic_auth.dart';
part 'auth/http_bearer_auth.dart';

part 'api/media_api.dart';
part 'api/posting_days_api.dart';
part 'api/posts_api.dart';
part 'api/relationships_api.dart';
part 'api/system_api.dart';

part 'model/api_error.dart';
part 'model/api_error_code.dart';
part 'model/api_error_error.dart';
part 'model/create_daily_post_request.dart';
part 'model/create_media_reservation_request.dart';
part 'model/create_media_reservation_response.dart';
part 'model/current_posting_day_response.dart';
part 'model/daily_post.dart';
part 'model/daily_post_prompt.dart';
part 'model/daily_post_tomorrow_note.dart';
part 'model/daily_prompt_response.dart';
part 'model/health_response.dart';
part 'model/media_content_type.dart';
part 'model/media_reservation.dart';
part 'model/media_reservation_status.dart';
part 'model/media_reservation_upload.dart';
part 'model/media_validation_failure_reason.dart';
part 'model/pending_relationship_request.dart';
part 'model/pending_request_page.dart';
part 'model/post_audience.dart';
part 'model/relationship_state.dart';
part 'model/relationship_status.dart';
part 'model/send_relationship_request.dart';
part 'model/test_response.dart';

/// An [ApiClient] instance that uses the default values obtained from
/// the OpenAPI specification file.
var defaultApiClient = ApiClient();

const _delimiters = {'csv': ',', 'ssv': ' ', 'tsv': '\t', 'pipes': '|'};
const _dateEpochMarker = 'epoch';
const _deepEquality = DeepCollectionEquality();
final _dateFormatter = DateFormat('yyyy-MM-dd');
final _regList = RegExp(r'^List<(.*)>$');
final _regSet = RegExp(r'^Set<(.*)>$');
final _regMap = RegExp(r'^Map<String,(.*)>$');

bool _isEpochMarker(String? pattern) =>
    pattern == _dateEpochMarker || pattern == '/$_dateEpochMarker/';
