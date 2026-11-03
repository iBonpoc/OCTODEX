export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Вариант кнопки */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** Высота: sm 28, md 32, lg 40 (телефон) */
  size?: 'sm' | 'md' | 'lg';
}
export function Button(props: ButtonProps): JSX.Element;
