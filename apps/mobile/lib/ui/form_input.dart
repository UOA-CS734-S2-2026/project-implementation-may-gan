import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app/theme.dart';

enum FormInputVariant { auth, posts }

/// WDCC's `FormInput`: a small sans label above a borderless field.
class DayliFormInput extends StatelessWidget {
  const DayliFormInput({
    super.key,
    required this.label,
    this.fieldKey,
    this.controller,
    this.variant = FormInputVariant.auth,
    this.placeholder,
    this.error,
    this.obscureText = false,
    this.keyboardType,
    this.autofillHints,
    this.inputFormatters,
    this.rows,
    this.onChanged,
    this.textCapitalization = TextCapitalization.none,
  });

  final String label;
  final Key? fieldKey;
  final TextEditingController? controller;
  final FormInputVariant variant;
  final String? placeholder;
  final String? error;
  final bool obscureText;
  final TextInputType? keyboardType;
  final Iterable<String>? autofillHints;
  final List<TextInputFormatter>? inputFormatters;

  /// Makes a textarea of this many rows.
  final int? rows;
  final ValueChanged<String>? onChanged;
  final TextCapitalization textCapitalization;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final textStyle = DayliText.sans(context, size: DayliTextSize.sm);
    final invalid = error != null;
    final fill = variant == FormInputVariant.auth
        ? colors.backgroundSecondary
        : colors.background;
    OutlineInputBorder ring(Color color) => OutlineInputBorder(
      borderRadius: BorderRadius.circular(6),
      borderSide: BorderSide(color: color, width: 2),
    );
    final idle = invalid
        ? ring(colors.danger.withValues(alpha: 0.5))
        : OutlineInputBorder(
            borderRadius: BorderRadius.circular(6),
            borderSide: BorderSide.none,
          );

    final field = TextField(
      key: fieldKey,
      controller: controller,
      obscureText: obscureText,
      keyboardType: rows != null ? TextInputType.multiline : keyboardType,
      autofillHints: autofillHints,
      inputFormatters: inputFormatters,
      minLines: rows,
      maxLines: rows ?? 1,
      onChanged: onChanged,
      textCapitalization: textCapitalization,
      style: textStyle,
      cursorColor: colors.foreground,
      decoration: InputDecoration(
        isDense: true,
        filled: true,
        fillColor: fill,
        hoverColor: Colors.transparent,
        hintText: placeholder,
        hintStyle: textStyle.copyWith(
          color: colors.foreground.withValues(alpha: 0.5),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        border: idle,
        enabledBorder: idle,
        focusedBorder: invalid
            ? ring(colors.danger.withValues(alpha: 0.5))
            : ring(colors.foreground.withValues(alpha: 0.2)),
      ),
    );

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
        if (variant == FormInputVariant.posts)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Transform.translate(
              offset: const Offset(-3, 0),
              child: field,
            ),
          )
        else
          field,
        if (invalid) ...[
          const SizedBox(height: 8),
          Text(
            error!,
            style: DayliText.sans(
              context,
              size: DayliTextSize.sm,
              color: colors.error,
            ),
          ),
        ],
      ],
    );
  }
}
