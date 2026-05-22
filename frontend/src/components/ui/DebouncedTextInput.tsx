import { useDebouncedField } from '../../hooks/useDebouncedField'

/**
 * Text input that commits to its `onCommit` callback at most once per
 * `delay` of idle typing, or immediately on blur / Enter. Every other
 * keystroke stays purely local, so a 30-user team can't accidentally
 * DDoS the backend by typing.
 */
interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value:    string
  onCommit: (next: string) => void
  delay?:   number
}

export function DebouncedTextInput({ value, onCommit, delay, onKeyDown, onBlur, ...rest }: Props) {
  const field = useDebouncedField(value, onCommit, delay)
  return (
    <input
      {...rest}
      value={field.value}
      onChange={e => field.onChange(e.target.value)}
      onBlur={e => { field.onBlur(); onBlur?.(e) }}
      onKeyDown={e => {
        if (e.key === 'Enter') field.onBlur()
        onKeyDown?.(e)
      }}
    />
  )
}

interface TextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value:    string
  onCommit: (next: string) => void
  delay?:   number
}

export function DebouncedTextarea({ value, onCommit, delay, onBlur, ...rest }: TextareaProps) {
  const field = useDebouncedField(value, onCommit, delay)
  return (
    <textarea
      {...rest}
      value={field.value}
      onChange={e => field.onChange(e.target.value)}
      onBlur={e => { field.onBlur(); onBlur?.(e) }}
    />
  )
}
