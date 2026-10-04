import 'dart:convert';

import 'package:dayli_mobile/legal/legal_document.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses the supported legal document structure', () {
    final document = DayliLegalDocument.fromJson(
      jsonDecode('''
        {
          "schemaVersion": 1,
          "id": "privacy",
          "title": "Privacy Policy",
          "status": "draft",
          "version": "draft-1",
          "effectiveDate": null,
          "summary": "Draft text.",
          "sections": [
            {
              "id": "draft-status",
              "title": "Draft status",
              "blocks": [
                {"type": "paragraph", "text": "Not approved."},
                {"type": "link", "label": "Terms", "href": "/terms"}
              ]
            }
          ]
        }
      '''),
    );

    expect(document.isDraft, isTrue);
    expect(document.sections.single.blocks, hasLength(2));
  });

  test('rejects an approved document with no effective date', () {
    expect(
      () => DayliLegalDocument.fromJson({
        'schemaVersion': 1,
        'id': 'privacy',
        'title': 'Privacy Policy',
        'status': 'approved',
        'version': '1',
        'effectiveDate': null,
        'summary': 'Text',
        'sections': [
          {
            'id': 'section',
            'title': 'Section',
            'blocks': [
              {'type': 'paragraph', 'text': 'Text'},
            ],
          },
        ],
      }),
      throwsFormatException,
    );
  });

  testWidgets(
    'loads the approved bundled privacy notice without a network request',
    (tester) async {
      final document = await loadLegalDocument('privacy');

      expect(document.title, 'Privacy Policy');
      expect(document.isDraft, isFalse);
      expect(document.effectiveDate, '2026-10-04');
      expect(document.sections.first.id, 'notice-and-effective-date');
    },
  );
}
