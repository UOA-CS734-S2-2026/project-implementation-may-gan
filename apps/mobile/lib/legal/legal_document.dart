import 'dart:convert';

import 'package:flutter/services.dart';

const _supportedDocumentIds = {'privacy', 'terms'};
const _supportedStatuses = {'draft', 'approved'};
final _sectionIdPattern = RegExp(r'^[a-z0-9]+(?:-[a-z0-9]+)*$');
final _datePattern = RegExp(r'^\d{4}-\d{2}-\d{2}$');

sealed class LegalBlock {
  const LegalBlock();
}

class LegalParagraph extends LegalBlock {
  const LegalParagraph(this.text);

  final String text;
}

class LegalList extends LegalBlock {
  const LegalList(this.items);

  final List<String> items;
}

class LegalLink extends LegalBlock {
  const LegalLink({required this.label, required this.href});

  final String label;
  final String href;
}

class LegalSection {
  const LegalSection({
    required this.id,
    required this.title,
    required this.blocks,
  });

  final String id;
  final String title;
  final List<LegalBlock> blocks;
}

class DayliLegalDocument {
  const DayliLegalDocument({
    required this.id,
    required this.title,
    required this.status,
    required this.version,
    required this.effectiveDate,
    required this.summary,
    required this.sections,
  });

  final String id;
  final String title;
  final String status;
  final String version;
  final String? effectiveDate;
  final String summary;
  final List<LegalSection> sections;

  bool get isDraft => status != 'approved';

  factory DayliLegalDocument.fromJson(Object? source) {
    if (source is! Map<String, dynamic>) {
      throw const FormatException('The document is not an object.');
    }
    if (source['schemaVersion'] != 1) {
      throw const FormatException('This document format is not supported.');
    }
    final id = _string(source['id'], 'document ID');
    if (!_supportedDocumentIds.contains(id)) {
      throw const FormatException('This document ID is not supported.');
    }
    final status = _string(source['status'], 'status');
    if (!_supportedStatuses.contains(status)) {
      throw const FormatException('This document status is not supported.');
    }
    final effectiveDate = source['effectiveDate'];
    if (effectiveDate != null &&
        (effectiveDate is! String || !_datePattern.hasMatch(effectiveDate))) {
      throw const FormatException('The effective date is invalid.');
    }
    if (status == 'approved' && effectiveDate == null) {
      throw const FormatException(
        'An approved document needs an effective date.',
      );
    }
    final rawSections = source['sections'];
    if (rawSections is! List || rawSections.isEmpty) {
      throw const FormatException('This document has no sections.');
    }
    final sectionIds = <String>{};
    final sections = rawSections
        .map((raw) {
          if (raw is! Map<String, dynamic>) {
            throw const FormatException('A section is invalid.');
          }
          final sectionId = _string(raw['id'], 'section ID');
          if (!_sectionIdPattern.hasMatch(sectionId) ||
              !sectionIds.add(sectionId)) {
            throw const FormatException('A section ID is invalid or repeated.');
          }
          final rawBlocks = raw['blocks'];
          if (rawBlocks is! List || rawBlocks.isEmpty) {
            throw const FormatException('A section has no content.');
          }
          return LegalSection(
            id: sectionId,
            title: _string(raw['title'], 'section title'),
            blocks: rawBlocks.map(_parseBlock).toList(growable: false),
          );
        })
        .toList(growable: false);
    return DayliLegalDocument(
      id: id,
      title: _string(source['title'], 'title'),
      status: status,
      version: _string(source['version'], 'version'),
      effectiveDate: effectiveDate as String?,
      summary: _string(source['summary'], 'summary'),
      sections: sections,
    );
  }
}

Future<DayliLegalDocument> loadLegalDocument(
  String id, {
  AssetBundle? bundle,
}) async {
  if (!_supportedDocumentIds.contains(id)) {
    throw ArgumentError.value(id, 'id', 'Unsupported legal document.');
  }
  final source = await (bundle ?? rootBundle).loadString(
    'assets/legal/$id.json',
  );
  return DayliLegalDocument.fromJson(jsonDecode(source));
}

LegalBlock _parseBlock(Object? raw) {
  if (raw is! Map<String, dynamic>) {
    throw const FormatException('A content block is invalid.');
  }
  switch (raw['type']) {
    case 'paragraph':
      return LegalParagraph(_string(raw['text'], 'paragraph'));
    case 'list':
      final items = raw['items'];
      if (items is! List || items.isEmpty) {
        throw const FormatException('A list is invalid.');
      }
      return LegalList(
        items.map((item) => _string(item, 'list item')).toList(growable: false),
      );
    case 'link':
      final href = _string(raw['href'], 'link target');
      if (href != '/privacy' && href != '/terms') {
        throw const FormatException('A link target is not supported.');
      }
      return LegalLink(label: _string(raw['label'], 'link label'), href: href);
    default:
      throw const FormatException('A content block type is not supported.');
  }
}

String _string(Object? value, String field) {
  if (value is! String || value.trim().isEmpty) {
    throw FormatException('The $field is missing.');
  }
  return value;
}
