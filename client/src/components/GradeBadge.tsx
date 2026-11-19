interface GradeBadgeProps {
  grade: string;
  size?: "sm" | "md" | "lg";
}

export default function GradeBadge({ grade, size = "md" }: GradeBadgeProps) {
  const cls = grade === "N/A" ? "grade-NA" : `grade-${grade}`;
  const sizeStyle = size === "lg"
    ? { fontSize: "15px", padding: "3px 10px", minWidth: "40px" }
    : size === "sm"
    ? { fontSize: "10px", padding: "1px 5px", minWidth: "24px" }
    : { fontSize: "12px", padding: "2px 7px", minWidth: "30px" };

  return (
    <span className={`grade-badge ${cls}`} style={sizeStyle}>
      {grade}
    </span>
  );
}
