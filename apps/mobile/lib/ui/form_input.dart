import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app/theme.dart';

/// Dayli's text field for phones: a label above a 48dp, 16px field so text
/// stays readable and iOS never zooms the page.
class DayliFormInput extends StatelessWidget {
  const DayliFormInput({
    super.key,
    required this.label,
    this.fieldKey,
    this.controller,
    this.placeholder,
    this.helper,
    this.error,
    this.obscureText = false,
    this.keyboardType,
    this.textInputAction,
    this.autofillHints,
    this.inputFormatters,
    this.minLines,
    this.maxLines = 1,
    this.onChanged,
    this.onSubmitted,
    this.suffix,
    this.textCapitalization = TextCapitalization.none,
  });

  final String label;
  final Key? fieldKey;
  final TextEditingController? controller;
  final String? placeholder;
  final String? helper;
  final String? error;
  final bool obscureText;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final Iterable<String>? autofillHints;
  final List<TextInputFormatter>? inputFormatters;
  final int? minLines;
  final int? maxLines;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final Widget? suffix;
  final TextCapitalization textCapitalization;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final textStyle = DayliText.sans(context, size: DayliTextSize.base);
    final invalid = error != null;
    OutlineInputBorder outline(Color color, double width) => OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: BorderSide(color: color, width: width),
    );
    final multiline = (maxLines ?? 2) > 1;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          label,
          style: DayliText.sans(
            context,
            size: DayliTextSize.sm,
            weight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          key: fieldKey,
          controller: controller,
          obscureText: obscureText,
          keyboardType: multiline ? TextInputType.multiline : keyboardType,
          textInputAction: textInputAction,
          autofillHints: autofillHints,
          inputFormatters: inputFormatters,
          minLines: minLines,
          maxLines: maxLines,
          onChanged: onChanged,
          onSubmitted: onSubmitted,
          textCapitalization: textCapitalization,
          style: textStyle,
          cursorColor: colors.foregroundAccent,
          decoration: InputDecoration(
            isDense: true,
            filled: true,
            fillColor: colors.backgroundSecondary,
            hoverColor: Colors.transparent,
            hintText: placeholder,
            hintStyle: textStyle.copyWith(color: colors.foregroundTertiary),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 14,
            ),
            suffixIcon: suffix,
            border: outline(Colors.transparent, 0),
            enabledBorder: invalid
                ? outline(colors.danger.withValues(alpha: 0.6), 1.5)
                : outline(Colors.transparent, 0),
            focusedBorder: invalid
                ? outline(colors.danger, 2)
                : outline(colors.accent, 2),
          ),
        ),
        if (invalid || helper != null) ...[
          const SizedBox(height: 6),
          Text(
            error ?? helper!,
            style: DayliText.sans(
              context,
              size: DayliTextSize.sm,
              color: invalid ? colors.danger : colors.foregroundTertiary,
            ),
          ),
        ],
      ],
    );
  }
}
