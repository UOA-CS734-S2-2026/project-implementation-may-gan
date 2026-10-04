import 'package:dayli_mobile/drafts/daily_post_draft.dart';
import 'package:dayli_mobile/weather/post_weather.dart';
import 'package:flutter_test/flutter_test.dart';

const rain = PostWeather(
  condition: WeatherCondition.rain,
  temperatureC: 11,
  placeName: 'Auckland',
);

DailyPostDraft draft({PostWeather? weather}) => DailyPostDraft(
  userId: 'user-1',
  localDate: '2026-09-25',
  promptId: 'prompt-09-25',
  promptText: 'What made you smile today?',
  idempotencyKey: 'key-1',
  updatedAt: DateTime.utc(2026, 9, 25, 3),
  reflectiveAnswer: 'Coffee by the harbour',
  rating: 7,
  audience: PostAudience.friends,
  weather: weather,
);

Map<String, Object?> json({Object? weather = const _Absent()}) => {
  ...draft().toJson(),
  if (weather is! _Absent) 'weather': weather,
};

class _Absent {
  const _Absent();
}

void main() {
  test('keeps the version 1 format', () {
    expect(DailyPostDraft.schemaVersion, 1);
  });

  group('storage', () {
    test('round trips the snapshot', () {
      final restored = DailyPostDraft.fromJson(draft(weather: rain).toJson());

      expect(restored!.weather, rain);
      expect(restored.reflectiveAnswer, 'Coffee by the harbour');
    });

    test('saves the three fields and nothing about where the author is', () {
      final saved = draft(weather: rain).toJson();

      expect(saved['weather'], {
        'condition': 'rain',
        'temperatureC': 11,
        'placeName': 'Auckland',
      });
      expect('$saved', isNot(contains('latitude')));
      expect('$saved', isNot(contains('longitude')));
    });

    test('writes no weather key for a draft without one', () {
      expect(draft().toJson().containsKey('weather'), isFalse);
    });

    test('loads a draft saved before weather existed', () {
      final restored = DailyPostDraft.fromJson(json());

      expect(restored, isNotNull);
      expect(restored!.weather, isNull);
    });

    test('drops a snapshot that fails the API limits and keeps the draft', () {
      for (final bad in <Object?>[
        null,
        'rain',
        <String, Object?>{},
        {'condition': 'hail', 'temperatureC': 11, 'placeName': 'Auckland'},
        {'condition': 'rain', 'temperatureC': 61, 'placeName': 'Auckland'},
        {'condition': 'rain', 'temperatureC': 11, 'placeName': ' Auckland'},
        {'condition': 'rain', 'temperatureC': 11, 'placeName': 'a' * 81},
        {'condition': 'rain', 'temperatureC': 11, 'placeName': 'Auck\nland'},
      ]) {
        final restored = DailyPostDraft.fromJson(json(weather: bad));

        expect(restored, isNotNull, reason: '$bad');
        expect(restored!.weather, isNull, reason: '$bad');
        expect(restored.reflectiveAnswer, 'Coffee by the harbour');
      }
    });
  });

  group('copying', () {
    test('keeps the snapshot through every other change', () {
      final original = draft(weather: rain);
      final changed = <DailyPostDraft>[
        original.copyWith(promptId: 'prompt-09-26'),
        original.copyWith(promptText: 'A new wording'),
        original.copyWith(idempotencyKey: 'key-2'),
        original.copyWith(updatedAt: DateTime.utc(2026, 9, 26)),
        original.copyWith(reflectiveAnswer: 'Different'),
        original.copyWith(caption: 'Caption'),
        original.copyWith(rating: () => 2),
        original.copyWith(rating: () => null),
        original.copyWith(audience: PostAudience.solo),
        original.copyWith(tomorrowNote: 'Note'),
        original.copyWith(
          attachments: [
            const DraftAttachment(localPath: '/a.jpg', mediaType: 'image'),
          ],
        ),
        original.copyWith(
          attachments: [
            const DraftAttachment(
              localPath: '/memo.m4a',
              mediaType: 'audio',
              reservationId: 'r-1',
              status: AttachmentUploadStatus.validated,
            ).withoutReservation(),
          ],
        ),
      ];

      for (final copy in changed) {
        expect(copy.weather, rain);
      }
    });

    test('replaces and removes the snapshot only when asked', () {
      const snow = PostWeather(
        condition: WeatherCondition.snow,
        temperatureC: -3,
        placeName: 'Queenstown',
      );

      expect(draft().copyWith(weather: () => rain).weather, rain);
      expect(draft(weather: rain).copyWith(weather: () => snow).weather, snow);
      expect(
        draft(weather: rain).copyWith(weather: () => null).weather,
        isNull,
      );
    });

    test('is not enough to make an otherwise empty draft worth keeping', () {
      final empty = DailyPostDraft(
        userId: 'u',
        localDate: 'd',
        promptId: 'p',
        promptText: 't',
        idempotencyKey: 'k',
        updatedAt: DateTime.utc(2026),
        weather: rain,
      );

      expect(empty.isEmpty, isTrue);
    });
  });
}
