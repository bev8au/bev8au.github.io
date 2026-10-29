// Where the mission-debrief console lives: the site's home page.
export const HOME = '/';

// Console tabs. Sections of the debrief page are hashes on HOME; the rest are their own routes.
export const tabs = [
	{ key: 'debrief', label: 'Debrief', hash: '#debrief' },
	{ key: 'sorties', label: 'Sorties', hash: '#sorties' },
	{ key: 'experience', label: 'Experience', href: '/experience/' },
	{ key: 'writing', label: 'Writing', href: '/blog/' },
	{ key: 'contact', label: 'Contact', href: '/contact/' },
] as const;

export type TabKey = (typeof tabs)[number]['key'];
