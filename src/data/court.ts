// What the court's arena boards show, from materials/basketball module content.docx. One entry per board, in the order
// they hang along the sideline from the hatch; `photos` name files in src/assets/court, captions are short labels.
// `banners` hang from the rafters.
export const court = {
	panels: [
		{
			tag: '01',
			section: 'Elementary school',
			title: 'Starting at center',
			photos: [
				{ file: 'school-game', caption: 'School team game' },
				{ file: 'team-huddle', caption: 'Team huddle' },
			],
			chips: ['Center', 'City league champions', 'Annual Honor Award'],
			paragraphs: [
				'Basketball has been part of my life for as long as I can remember. In elementary school, I was the tallest kid in my grade, so when I joined the school team, the coach put me at center. We practiced for an hour and a half every afternoon under a coach who missed nothing: if a play drifted even slightly from the plan, she would catch it and tell us exactly what went wrong. Those afternoons taught us to care about the small details and to trust one another on the court. In sixth grade, that discipline paid off when we won the city basketball league championship. The school honored our team with its Annual Honor Award, the highest distinction a student can receive there.',
			],
		},
		{
			tag: '02',
			section: 'High school',
			title: 'A hoop for everyone',
			photos: [{ file: 'slam-dunk', caption: 'Slam dunk contest' }],
			chips: ['Student council', 'First slam dunk contest'],
			paragraphs: [
				'In high school, a heavy academic schedule kept me off the varsity team, but it didn’t keep me away from the sport. As a member of the student council, I looked for ways to bring basketball to everyone who loved it. On behalf of the school’s basketball fans, I drafted a joint proposal asking the principal to buy a mini basketball hoop with the school budget. Upon approval, we organized the first slam dunk contest in our school’s history. With the lowered rim, you didn’t need a huge vertical to throw one down. Students who had never dunked before took flight, and many of them invented creative new dunks of their own.',
			],
		},
		{
			tag: '03',
			section: 'College',
			title: 'CSSS Basketball Team',
			photos: [
				{ file: 'csss-team', caption: 'CSSS Basketball Team' },
				{ file: 'csss-tournament', caption: 'Tournament weekend' },
			],
			chips: ['Team captain', 'Senior year'],
			paragraphs: [
				'In college, I found my basketball home with the CSSS Basketball Team, made up mostly of Chinese international students. The team ran a more sophisticated tactical system than anything I had played before, and the bond among teammates ran deeper too. Each semester, we competed in an intramural tournament and two intercollegiate tournaments. On Friday evenings, we would drive to the host city, play through the weekend, and make the long drive back to campus Sunday night. Because alumni were allowed to play, every tournament also became a reunion. Former teammates flew in from across the country, all drawn back by the same love for the game, and that shared passion gave us a real sense of brotherhood.',
				'In my senior year, I was named team captain. Off the court, I led our twice-weekly practices, booked gym time, and coordinated our game schedules. On the court, I designed practice plans, ran targeted preparation before each game, studied new plays, and built our team system around each player’s strengths and style. Leading the team was one of the most valuable lessons in leadership I’ve had.',
			],
		},
	],
	banners: [
		{ top: 'City League', middle: 'Champions', bottom: 'Sixth grade' },
		{ top: 'Annual', middle: 'Honor Award', bottom: 'Elementary school' },
		{ top: 'First ever', middle: 'Dunk Contest', bottom: 'High school' },
		{ top: 'CSSS', middle: 'Captain', bottom: 'Senior year' },
	],
};
