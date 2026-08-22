import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export default function Button({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`${styles.btn} ${styles[variant]} ${styles[size]} ${className}`}
      {...rest}
    />
  );
}
