export type SectionIllustrationName = 'screens' | 'assets' | 'feedback' | 'delivery' | 'knowledge' | 'security';
/** Decorative context beside an existing text label; never replaces a control's accessible name. */
export function SectionIllustration({name,size=96,className}:{name:SectionIllustrationName;size?:number;className?:string}) {
 return <img src={`/illustrations/${name}.webp`} alt="" aria-hidden="true" width={size} height={size} loading="lazy" decoding="async" className={className} style={{objectFit:'contain',flexShrink:0}}/>;
}
