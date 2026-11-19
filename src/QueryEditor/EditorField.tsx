import { css } from '@emotion/css';
import { type ComponentProps } from 'react';
import * as React from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { Field, Icon, type PopoverContent, ReactUtils, Tooltip, useStyles2 } from '@grafana/ui';

interface EditorFieldProps extends ComponentProps<typeof Field> {
  label: string;
  children: React.ReactElement<Record<string, unknown>>;
  width?: number | string;
  optional?: boolean;
  tooltip?: PopoverContent;
}

export const EditorField = (props: EditorFieldProps) => {
  const { label, optional, tooltip, children, width, ...fieldProps } = props;

  const styles = useStyles2(getStyles, width);

  // Null check for backward compatibility
  const childInputId = fieldProps?.htmlFor || ReactUtils?.getChildId(children);

  const labelEl = (
    <>
      <label className={styles.label} htmlFor={childInputId}>
        {label}
        {optional && <span className={styles.optional}> - optional</span>}
        {tooltip && (
          <Tooltip placement="top" content={tooltip} theme="info">
            <Icon name="info-circle" size="sm" className={styles.icon} />
          </Tooltip>
        )}
      </label>
      <span className={styles.space} />
    </>
  );

  return (
    <div className={styles.root}>
      <Field className={styles.field} label={labelEl} {...fieldProps}>
        {children}
      </Field>
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2, width?: number | string) => ({
  space: css({
    paddingRight: theme.spacing(0),
    paddingBottom: theme.spacing(0.5),
  }),
  root: css({
    minWidth: theme.spacing(width ?? 0),
  }),
  label: css({
    // The tooltip icon is taller than the 12px label text, and `vertical-align: middle`
    // centres it on the baseline plus half an x-height, which lands it a bit below the
    // text's optical centre. Lay the label out as a flex row so the two line up.
    alignItems: 'center',
    display: 'inline-flex',
    fontSize: 12,
    fontWeight: theme.typography.fontWeightMedium,
  }),
  optional: css({
    fontStyle: 'italic',
    color: theme.colors.text.secondary,
  }),
  field: css({
    marginBottom: 0, // GrafanaUI/Field has a bottom margin which we must remove
  }),
  icon: css({
    color: theme.colors.text.secondary,
    marginLeft: theme.spacing(1),
    ':hover': {
      color: theme.colors.text.primary,
    },
  }),
});
