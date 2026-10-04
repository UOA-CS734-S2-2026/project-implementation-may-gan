import 'package:dayli_mobile/app/pending_destination.dart';
import 'package:dayli_mobile/compose/composer_link.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('parsePrefilledRating', () {
    test('accepts every whole number from 1 to 10', () {
      for (var rating = 1; rating <= 10; rating++) {
        expect(parsePrefilledRating('$rating'), rating);
      }
    });

    test('ignores a missing rating', () {
      expect(parsePrefilledRating(null), isNull);
      expect(parsePrefilledRating(''), isNull);
    });

    test('ignores ratings outside 1 to 10', () {
      for (final raw in ['0', '11', '99', '-1', '100']) {
        expect(parsePrefilledRating(raw), isNull, reason: raw);
      }
    });

    test('ignores anything that is not a whole number', () {
      for (final raw in ['seven', '7.5', '7a', ' 7', '+7', '0x7', '1e1']) {
        expect(parsePrefilledRating(raw), isNull, reason: raw);
      }
    });
  });

  group('composerLocation', () {
    test('keeps a valid rating and drops the scheme and host', () {
      expect(
        composerLocation(Uri.parse('dayli://app/post?rating=7')),
        '/post?rating=7',
      );
    });

    test('opens the composer empty for an invalid rating', () {
      for (final link in [
        'dayli://app/post?rating=11',
        'dayli://app/post?rating=0',
        'dayli://app/post?rating=great',
        'dayli://app/post?rating=',
      ]) {
        expect(composerLocation(Uri.parse(link)), '/post', reason: link);
      }
    });

    test('opens the composer empty without a rating', () {
      expect(composerLocation(Uri.parse('dayli://app/post')), '/post');
      expect(composerLocation(Uri.parse('/post')), '/post');
    });

    test('ignores every other parameter', () {
      expect(
        composerLocation(
          Uri.parse(
            'dayli://app/post?audience=friends&rating=4&answer=hello&post=1',
          ),
        ),
        '/post?rating=4',
      );
      expect(
        composerLocation(Uri.parse('dayli://app/post?audience=solo')),
        '/post',
      );
    });
  });

  group('PendingDestination', () {
    test('is empty until a location is remembered', () {
      expect(PendingDestination().take(), isNull);
    });

    test('returns the remembered location once', () {
      final pending = PendingDestination()..remember('/post?rating=3');
      expect(pending.take(), '/post?rating=3');
      expect(pending.take(), isNull);
    });

    test('keeps only the latest location', () {
      final pending = PendingDestination()
        ..remember('/post?rating=3')
        ..remember('/post');
      expect(pending.take(), '/post');
    });
  });
}
