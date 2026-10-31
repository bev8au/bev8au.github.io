// What the screens inside the vessel's command module show, from materials/command module content.docx.
// One entry per wall screen, in the order they are met walking in from the hatch. `photos` name files in src/assets/cabin;
// their captions are short labels under each photo.
export const commandModule = [
	{
		tag: '01',
		section: 'Brief introduction',
		title: 'Hi, I am Martin',
		photos: [{ file: 'headshot', caption: 'Martin Liu' }],
		chips: ['Finance', 'Quantitative Finance', 'Analytics & AI', 'Computer Science minor'],
		paragraphs: [
			'Hi, I am a student at the McIntire School of Commerce at the University of Virginia. I have a concentration in Finance, two tracks in Quantitative Finance and Analytics & AI, and a Computer Science minor outside the Commerce School.',
			'I have completed internships across different sectors of the finance industry, including equity research, private equity, venture capital, and investment banking. These experiences have also given me opportunities to apply my interdisciplinary background to business questions.',
			'Beyond these internships, I was a TA for a graduate-level financial management course at the Commerce School. I also worked at UVA Dine, organizing the C’ville Market, where local vendors sell freshly made food on Grounds. Academically, I love astronomy. During the summer of 2024, I participated in a dark matter research project, and our paper was accepted by The Astrophysical Journal.',
		],
	},
	{
		tag: '02',
		section: 'Life stories',
		title: 'Growing up in a close-knit community',
		photos: [
			{ file: 'school-friends', caption: 'Friends from school' },
			{ file: 'school', caption: 'School in Beijing' },
		],
		chips: [],
		paragraphs: [
			'I spent my childhood in Beijing, attending Beijing Primary School, Beijing No. 8 Middle School, and later the international division of the Experimental High School Attached to Beijing Normal University. Yet the experience that made my early education distinctive was living at school from a young age.',
			'My elementary school was, at the time, Beijing’s only public boarding elementary school. From Monday through Friday, my classmates and I shared a daily routine that extended well beyond the classroom. School was where we studied, but it was also where we spent most of our lives together. That combination of structure and familiarity defined much of my childhood.',
			'What has stayed with me most is the closeness of those friendships. We knew one another through the ordinary moments of each day, not just through lessons or school events. Over time, those shared routines created a strong sense of belonging. When I think back to elementary school, I remember a community as much as a place of learning.',
		],
	},
	{
		tag: '02',
		section: 'Life stories',
		title: 'A different kind of classroom',
		photos: [{ file: 'australia', caption: 'Australia, fifth grade' }],
		chips: [],
		paragraphs: [
			'In fifth grade, an exchange program gave me my first opportunity to experience a very different school environment. I was paired with an Australian buddy, who visited our school during the academic year. That summer, I traveled to Australia and spent two weeks with their family, joining them in their everyday life and attending their local elementary school.',
			'I was struck by how much of the school day in Australia unfolded outdoors. There was ample time for sports, and nature felt like a part of daily life. Even the journey to school was memorable: we would see kangaroos along the way.',
			'What made the experience meaningful was the chance to participate in that rhythm of life. Staying with a local family and going to school with my buddy allowed me to experience the differences through everyday routines. For those two weeks, another country became more than a place I was visiting—it became a place where I could briefly feel at home.',
		],
	},
	{
		tag: '03',
		section: 'My cat',
		title: 'Mimi',
		photos: [{ file: 'mimi', caption: 'Mimi, British Shorthair' }],
		chips: ['Since 2015', 'British Shorthair', 'Sunshine napper'],
		paragraphs: [
			'Mimi joined our family in 2015, when she was just two months old. She is a gray British Shorthair with a gentle, easygoing personality. Since then, she has become a familiar and much-loved presence in our home.',
			'Her favorite activities are simple: sleeping in the sunshine and playing hide-and-seek with us among my mom’s flowerpots. Those two pastimes capture her personality quite well. She is usually quiet and content to find a warm spot for a nap, but she also has a playful side that comes out among the flowers.',
		],
	},
];
