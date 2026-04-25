// EyebrowLabel — small-caps section label between the example pills and
// the project grid. Reads "OR TRY NEXTWORK PROJECTS" by default per Paper
// frame `31R-0`. Uses the existing `.type-label-s` global class (Inter
// Bold uppercase, 11px, 0.14em tracking) for consistency with the rest
// of the prototype's editorial labels.

export interface EyebrowLabelProps {
  children?: React.ReactNode
  className?: string
}

export function EyebrowLabel({
  children = 'Or try NextWork projects',
  className,
}: EyebrowLabelProps) {
  return (
    <div
      className={
        'type-label-s text-center text-brand-400' +
        (className ? ` ${className}` : '')
      }
    >
      {children}
    </div>
  )
}
