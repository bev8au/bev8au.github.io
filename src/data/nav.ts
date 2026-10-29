// Where the mission-debrief console lives. Change this one value when the design moves to the site root.
export const HOME = '/designs/debrief';

// Console tabs. Sections of the debrief page are hashes on HOME; the rest are their own routes.
export const tabs = [
	{ key: 'debrief', label: 'Debrief', hash: '#debrief' },
	{ key: 'sorties', label: 'Sorties', hash: '#sorties' },
	{ key: 'experience', label: 'Experience', href: '/experience/' },
	{ key: 'writing', label: 'Writing', href: '/blog/' },
	{ key: 'contact', label: 'Contact', href: '/contact/' },
] as const;

export type TabKey = (typeof tabs)[number]['key'];
