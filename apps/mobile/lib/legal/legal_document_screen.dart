import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app/app_scope.dart';
import '../app/theme.dart';
import '../auth/session_controller.dart';
import 'legal_document.dart';

class LegalDocumentScreen extends StatelessWidget {
  const LegalDocumentScreen({super.key, required this.documentId});

  final String documentId;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Scaffold(
      backgroundColor: colors.background,
      body: SafeArea(
        child: FutureBuilder<DayliLegalDocument>(
          future: loadLegalDocument(documentId),
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return _LoadError(onBack: () => _goBack(context));
            }
            if (!snapshot.hasData) {
              return const Center(child: CircularProgressIndicator());
            }
            return _DocumentBody(
              document: snapshot.data!,
              onBack: () => _goBack(context),
            );
          },
        ),
      ),
    );
  }

  void _goBack(BuildContext context) {
    if (context.canPop()) {
      context.pop();
      return;
    }
    switch (AppScope.of(context).session.status) {
      case SessionStatus.unknown:
        context.go('/splash');
      case SessionStatus.signedOut:
        context.go('/welcome');
      case SessionStatus.signedIn:
        context.go('/');
    }
  }
}

class _DocumentBody extends StatelessWidget {
  const _DocumentBody({required this.document, required this.onBack});

  final DayliLegalDocument document;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return CustomScrollView(
      key: Key('legal.${document.id}.scroll'),
      slivers: [
        SliverAppBar(
          floating: true,
          backgroundColor: colors.background,
          surfaceTintColor: Colors.transparent,
          leading: IconButton(
            tooltip: 'Back',
            onPressed: onBack,
            icon: const Icon(Icons.arrow_back_rounded),
          ),
          title: Text(
            'Dayli legal',
            style: DayliText.serif(context, weight: FontWeight.w600),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 36),
          sliver: SliverToBoxAdapter(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 700),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Semantics(
                      header: true,
                      child: Text(
                        document.title,
                        style: DayliText.serif(
                          context,
                          fontSize: 36,
                          weight: FontWeight.w600,
                          tracking: DayliTracking.tight,
                        ).copyWith(height: 1.1),
                      ),
                    ),
                    const SizedBox(height: 16),
                    if (document.isDraft)
                      Container(
                        key: const Key('legal.draftNotice'),
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: colors.backgroundAccent,
                          border: Border.all(
                            color: colors.foregroundAccent.withValues(
                              alpha: 0.3,
                            ),
                          ),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Text(
                          'Draft, not approved for publication. This document has no effective date and is awaiting operator and legal review.',
                          style: DayliText.sans(
                            context,
                            size: DayliTextSize.sm,
                            color: colors.foregroundAccent,
                          ),
                        ),
                      )
                    else
                      Text(
                        'Effective ${document.effectiveDate}',
                        style: DayliText.sans(
                          context,
                          size: DayliTextSize.sm,
                          color: colors.foregroundSecondary,
                        ),
                      ),
                    const SizedBox(height: 16),
                    SelectableText(
                      document.summary,
                      style: DayliText.serif(
                        context,
                        size: DayliTextSize.lg,
                        color: colors.foregroundSecondary,
                      ).copyWith(height: 1.45),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Version: ${document.version}',
                      style: DayliText.sans(
                        context,
                        size: DayliTextSize.xs,
                        color: colors.foregroundTertiary,
                      ),
                    ),
                    const SizedBox(height: 30),
                    for (final section in document.sections) ...[
                      Semantics(
                        header: true,
                        child: Text(
                          section.title,
                          style: DayliText.serif(
                            context,
                            size: DayliTextSize.xl,
                            weight: FontWeight.w600,
                            tracking: DayliTracking.tight,
                          ),
                        ),
                      ),
                      const SizedBox(height: 10),
                      for (final block in section.blocks) _Block(block: block),
                      const SizedBox(height: 28),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _Block extends StatelessWidget {
  const _Block({required this.block});

  final LegalBlock block;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final style = DayliText.sans(
      context,
      size: DayliTextSize.base,
      color: colors.foregroundSecondary,
    ).copyWith(height: 1.5);
    return switch (block) {
      LegalParagraph(:final text) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: SelectableText(text, style: style),
      ),
      LegalList(:final items) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final item in items)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: SelectableText('• $item', style: style),
              ),
          ],
        ),
      ),
      LegalLink(:final label, :final href) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: TextButton(
          onPressed: () => context.push(href),
          style: TextButton.styleFrom(
            alignment: Alignment.centerLeft,
            foregroundColor: colors.foregroundAccent,
            minimumSize: const Size(48, 48),
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
          ),
          child: Text(
            label,
            style: DayliText.sans(
              context,
              weight: FontWeight.w600,
              color: colors.foregroundAccent,
            ),
          ),
        ),
      ),
    };
  }
}

class _LoadError extends StatelessWidget {
  const _LoadError({required this.onBack});

  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'This legal document could not be opened.',
                style: DayliText.serif(
                  context,
                  size: DayliTextSize.xl,
                  weight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Try updating the app. Reading legal documents does not need an internet connection.',
                style: DayliText.sans(
                  context,
                  color: colors.foregroundSecondary,
                ),
              ),
              const SizedBox(height: 20),
              TextButton.icon(
                onPressed: onBack,
                icon: const Icon(Icons.arrow_back_rounded),
                label: const Text('Go back'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
