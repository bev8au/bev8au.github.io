// Résumé content. Base: materials/推荐信简历.docx (the most complete version).
// Goldman Sachs and the HUAXI title come from the newer materials/Martin Liu resume.pdf (Oct 2026).
// Newest first within each list; ongoing roles lead their list.
export type Role = {
	title: string;
	org: string;
	place: string;
	start: string; // YYYY.MM
	end: string; // YYYY.MM, or 'Present'
	note?: string; // e.g. a supervisor or course codes
	points: string[];
	links?: { label: string; url: string }[];
};

export const roles: Role[] = [
	{
		title: 'Investment Banking Department Intern',
		org: 'Goldman Sachs GH Securities',
		place: 'Beijing, China',
		start: '2026.06',
		end: '2026.08',
		points: [
			'Analyzed product mix and business models of two target companies in AI IIoT and AI agent infrastructure industries, evaluated M&A synergies with potential buyers across product, technology, data, and cost dimensions, and prepared pitchbook materials for buyer outreach.',
			"Built a valuation model for a leading Chinese automaker, forecasting earnings by country and vehicle model, with scenario analysis for Middle East expansion; pitched a block trade solution to a regional PE firm to mitigate selling pressure from the client's shareholder lockup expiry.",
		],
	},
	{
		title: 'Investment Department Intern',
		org: 'China Mobile Investment',
		place: 'Beijing, China',
		start: '2025.05',
		end: '2025.08',
		points: [
			"RISC-V semiconductor industry research: analyzed the architecture's differences from ARM and x86 and its application scenarios by reviewing RISC-V ISA papers and industry materials; identified edge-device investment opportunities driven by RISC-V's high compatibility and modular design, including microcontrollers, industrial tablets, and home robotics, through stakeholder interviews, policy review, and market analysis; completed a 50-page industry research report.",
			"Coowa Robotics investment project: drafted the project initiation report and took part in commercial and financial due diligence; analyzed the company's business model and unit economics, and built a free cash flow forecast and valuation model from historical financial performance and expansion assumptions, supporting the successful closing of a $100 million investment.",
		],
	},
	{
		title: 'Private Equity Intern',
		org: 'Portola Growth Partners',
		place: 'New York, NY (remote)',
		start: '2025.01',
		end: '2025.05',
		points: [
			'Researched the pediatric behavioral health sector, screened 100 startups across geography, clinic footprint, business model, and healthcare resources, and identified and contacted five potential investment targets.',
			"Conducted due diligence on Unicare Diagnostics, including income statement, EBITDA, and margin analysis; evaluated opportunities in ventilator management systems and home medical equipment driven by the rising prevalence of chronic illness among children and hospital readmission reduction trends; assessed the company's competitive differentiation, including provider relationships, sub-5% denial rates, and patient management capabilities.",
		],
	},
	{
		title: 'Student Consultant',
		org: 'StudentBrains Consulting',
		place: 'New York, NY (remote)',
		start: '2025.01',
		end: '2025.05',
		points: [
			'Evaluated 50+ local businesses in the Charlottesville area across websites, social media, and third-party platforms, assessing their business models, market potential, and promotional strategies to identify potential clients and support sales outreach.',
			'Led a revenue growth analysis for an art auction client, using Excel and Tableau to break down and visualize historical revenue mix and identify high-value customer segments, key geographic markets, and effective outreach channels for new customer acquisition.',
		],
	},
	{
		title: 'Sustainability Intern',
		org: 'Aramark',
		place: 'Charlottesville, VA',
		start: '2024.09',
		end: '2025.05',
		points: [
			'Collected and analyzed food waste data across three on-campus dining halls, tracking waste volume and composition by location, time, and waste type to support data-driven waste reduction initiatives.',
			"Assessed the financial feasibility of 10 campus sustainability projects and organized the monthly C'ville Market, engaging 2,000+ participants and partnering with 30+ local vendors from underserved communities to promote sustainable dining.",
		],
	},
	{
		title: 'Equity Research Intern',
		org: 'HUAXI Securities',
		place: 'Beijing, China',
		start: '2024.05',
		end: '2024.08',
		points: [
			"Analyzed 30+ data-center GPU architectures, tracking changes in memory, processors, I/O interfaces, and performance metrics; built a Python-based specification dataset and applied machine learning to examine a decade of NVIDIA and AMD product trends, forecasting next-generation GPU features and differentiation paths that were largely reflected in NVIDIA's later releases.",
			"Reviewed a decade of NVIDIA's investments and M&A to assess its ecosystem strategy across data-center infrastructure, cloud computing, model training management, and downstream applications such as autonomous driving, robotics, and bioengineering; completed a 40-page industry research report.",
			"Researched China's IoT industry and visited Wanma Technology; assessed its telecommunication infrastructure, digital healthcare, and Internet of Vehicles businesses using industry policy, market conditions, business portfolio analysis, and financial and valuation data from Wind; completed a 17-page due diligence report.",
		],
	},
	{
		title: 'Venture Capital Intern',
		org: 'LXL Capital',
		place: 'New York, NY (remote)',
		start: '2023.12',
		end: '2024.03',
		points: [
			'Tracked financing activity of technology startups worldwide on Crunchbase, analyzing business models, investor rationale, and use of proceeds, and estimating valuation ranges by applying industry and funding-round multiples to investment sizes; produced 10 weekly market reports.',
			'Conducted due diligence on seven big-data startups, assessing competitive strengths, market positioning, competitive landscape, and product differentiation; analyzed financial statements, ratios, and growth trajectories with Excel-based models, and prepared internal investment presentations.',
		],
	},
];

export const academic: Role[] = [
	{
		title: 'Integrated Core Experience (ICE)',
		org: 'McIntire School of Commerce',
		place: 'Charlottesville, VA',
		start: '2025.09',
		end: '2026.05',
		points: [
			'Designed a new global travel repatriation service proposal for Allianz, estimated the U.S. market size, built revenue and cost forecasts and a financial model, calculated a 25.09% IRR, ran sensitivity analysis, and presented the proposal to Allianz executives in a 30-minute presentation and Q&A.',
			"Developed an M&A proposal for Uber's acquisition of GoTo, using Tableau to analyze segment-level loss trends, quantify revenue, cost, and financial synergies, and perform standalone and post-merger DCF valuations; projected $1.9B in total synergy value and designed a half-cash, half-stock deal structure to share risk and preserve Uber's liquidity.",
		],
	},
	{
		title: 'Teaching Assistant',
		org: 'McIntire School of Commerce',
		place: 'Charlottesville, VA',
		start: '2025.09',
		end: '2026.05',
		note: 'Courses: GCOM 7060 and COMM 2002',
		points: [
			'Led office hours and review sessions, supporting 300+ students with core finance concepts, including the time value of money, CAPM, portfolio theory, capital budgeting, and company valuation.',
		],
	},
	{
		title: 'Research Assistant: Emulating D/J Factors for Milky Way-like Galaxies',
		org: 'University of Virginia, Department of Astronomy',
		place: 'Charlottesville, VA',
		start: '2024.05',
		end: '2024.09',
		note: 'Supervisor: Prof. Paul Torrey',
		points: [
			'Built spatial models in Python to process 1,024 supercomputer-simulated galaxy datasets from the DREAMS collaboration, analyzed dark matter density profiles of Milky Way-like galaxies, and calculated D- and J-factors under different models to support quantitative estimates of dark matter decay and annihilation signals.',
			'Used emulator-based modeling to study how D- and J-factors relate to galaxy properties, including total mass structure, metallicity, central black hole accretion rate, and star formation rate, and what that implies for dark matter distribution.',
			'Ninth author of "Disentangling the Impact of Halo-to-Halo Variance and Baryonic Feedback on Milky Way Dark Matter Density Profiles", published in The Astrophysical Journal.',
		],
		links: [{ label: 'Read the paper on arXiv', url: 'https://arxiv.org/abs/2512.03132' }],
	},
];

export const activities: Role[] = [
	{
		title: 'Captain',
		org: 'UVA Chinese Basketball Team',
		place: 'Charlottesville, VA',
		start: '2023.09',
		end: 'Present',
		points: [
			'Led twice-weekly practices and developed team tactics, helping the team win Triangle League Runner-up and NECBL Division Champion titles.',
			"Secured $4,000 in sponsorship funding through sponsor outreach to support the team's daily operations.",
		],
	},
	{
		title: 'Project Lead',
		org: 'UVA Credit & Restructuring Club',
		place: 'Charlottesville, VA',
		start: '2024.09',
		end: '2025.05',
		points: [
			"Studied debt financing instruments, repayment priority, and bankruptcy and restructuring processes; learned credit and restructuring analysis frameworks through real case studies shared by KKR's restructuring team.",
			'Led a four-member team researching AI-enabled corporate financing: the use of machine learning and big data in credit assessment, bond pricing, and private credit, and the implications for financing efficiency, risk management, and model risks such as black-box behavior and data bias.',
		],
	},
	{
		title: 'Director of Publicity',
		org: 'UVA Mainland Student Network',
		place: 'Charlottesville, VA',
		start: '2023.09',
		end: '2024.05',
		points: [
			"Helped organize 30+ academic, career development, cultural, and recreational events for Chinese international students; designed 20+ event posters and managed the association's social media accounts.",
			'Secured $7,000+ in sponsorship partnerships through sponsor outreach; performed a one-hour solo piano recital at UVA Old Cabell Hall for an audience of 300+.',
		],
	},
];

export const education = {
	// University, then school; each links to its official site
	school: [
		{ name: 'University of Virginia', url: 'https://www.virginia.edu/' },
		{ name: 'McIntire School of Commerce', url: 'https://www.commerce.virginia.edu/' },
	],
	place: 'Charlottesville, VA',
	degree: 'Bachelor of Science in Commerce, minor in Computer Science',
	dates: 'Aug 2023 to May 2027 (expected)',
	facts: [
		{ label: 'Concentration', value: 'Finance' },
		{ label: 'Tracks', value: 'Quantitative Finance; Analytics and AI' },
		{ label: 'GPA', value: '3.901 / 4.0' },
		{ label: "Dean's List", value: 'Fall 2023, Spring 2024, Spring 2025, Fall 2025' },
		{ label: 'Teaching assistant', value: 'Foundations of Finance; Financial Management' },
	],
	courses: [
		'Quantitative & Financial Analysis',
		'Intermediate Corporate Finance',
		'Intermediate Accounting',
		'Data Structures and Algorithms',
		'Discrete Math and Theory',
		'Introduction to Regression Analysis',
	],
	next: 'Applying to graduate school, expected to graduate May 2028',
};

// Each tool links to its official site (checked October 2026). C has no vendor, so it points to the ISO C committee.
export const skills = [
	{
		group: 'Programming',
		items: [
			{ name: 'Python', url: 'https://www.python.org/' },
			{ name: 'Java', url: 'https://www.java.com/' },
			{ name: 'C', url: 'https://www.open-std.org/jtc1/sc22/wg14/' },
		],
	},
	{
		group: 'Data analytics and visualization',
		items: [
			{ name: 'Tableau', url: 'https://www.tableau.com/' },
			{ name: 'RStudio', url: 'https://posit.co/products/open-source/rstudio/' },
			{ name: 'MySQL', url: 'https://www.mysql.com/' },
			{ name: 'Excel', url: 'https://www.microsoft.com/en-us/microsoft-365/excel' },
		],
	},
	{
		group: 'Financial terminals',
		items: [
			{ name: 'Wind', url: 'https://www.wind.com.cn/' },
			{ name: 'Bloomberg', url: 'https://professional.bloomberg.com/products/bloomberg-terminal/' },
			{ name: 'Capital IQ', url: 'https://www.spglobal.com/market-intelligence/en/solutions/products/sp-capital-iq-pro' },
			{ name: 'Crunchbase', url: 'https://www.crunchbase.com/' },
		],
	},
];

export const interests = [
	{
		name: 'Astronomy',
		detail: "Dark matter research paper in high school under NYU's Prof. Gerceida Jones; S.-T. Yau High School Science Award, Northern China semifinalist; British Physics Olympiad Top Gold; British Astronomy and Astrophysics Olympiad silver.",
	},
	{
		name: 'Piano',
		detail: 'Multiple competition awards; 200K+ social media views for performance videos; a one-hour solo recital at UVA Old Cabell Hall.',
	},
	{
		name: 'Basketball',
		detail: 'Captain of the UVA Chinese Basketball Team.',
	},
];
