/**
 * What each IndiaFOSS 2026 devroom says about itself: tagline, introduction
 * and managers, copied from its page at fossunited.org/indiafoss/2026/devrooms
 * (checked 24 Sep 2026). The programme feed carries only the devroom's name;
 * its sessions, room and times still come from the bundle.
 */
export type DevroomBlock = { text: string } | { heading: string } | { list: string[] };

export interface DevroomProfile {
  /** Path segment on fossunited.org, and the artwork key in devroom-art.ts. */
  slug: string;
  tagline: string;
  about: DevroomBlock[];
  managers: string[];
}

export const DEVROOM_SOURCE = 'https://fossunited.org/indiafoss/2026/devrooms';

export const devroomProfiles: Record<string, DevroomProfile> = {
  'devroom-android-open-source-project-aosp': {
    slug: 'aosp',
    tagline: 'All things Android',
    about: [
      {
        text: 'We are excited to share the sessions selected for the AOSP Devroom at IndiaFOSS 2026.',
      },
      {
        text: 'This year’s lineup covers everything from AOSP Ecosystem updates, Bootloaders and HIDL -> AIDL HALs to Rust in Android, Device bring-up, Security & System internals, Launcher3 & IME deep dives, custom ROMs and Android platform engineering.',
      },
      {
        text: 'Expect a mix of deep technical dives, real-world bring-up stories, debugging adventures and hands-on lessons from developers working across the AOSP stack.',
      },
    ],
    managers: ['Amit Pundir', 'Sumit Semwal'],
  },
  'devroom-cloud-devops': {
    slug: 'devops',
    tagline: "It's 3 AM. Prod is down. Who is on-call?",
    about: [
      {
        text: "It's 3 AM and prod is down. Everything you're paging through to fix it (Kubernetes, Prometheus, OpenTelemetry, containerd) is open source all the way down, and so is most of what anyone knows about running it. This room is for the people who do that job: the platform engineers, SREs, and operators who ship something at 2 PM and get woken up by it at 3 AM.",
      },
      {
        text: "We picked talks with a real story behind them. No vendor pitches, nothing that stops at hello-world. Ten people telling you what actually happened: the patch that fixed the bug upstream, the dashboard someone rebuilt because the old one was a mess, and the postmortem written the morning after a helm upgrade took prod down. There's OpenTelemetry internals, AI agents getting handed the pager, Cilium policies gone wrong, and someone who's kept a service alive on one 8 GB server for fifteen years. Pull up a chair. Prod can wait.",
      },
    ],
    managers: ['Pratik Singh', 'Dhruv puri'],
  },
  'devroom-compilers-programming-languages-and-systems': {
    slug: 'compilers',
    tagline: 'Everything is a Compiler',
    about: [
      {
        text: 'India - especially Bangalore, Hyderabad and Pune - has thousands of engineers working on Compilers, Programming Languages and Systems. While it might be dwarfed by the number of software engineers working in other areas, it is a very well-connected community. Professors, engineers and students collaborate closely to work on technologies such as LLVM, MLIR, GCC and tools. This devroom aim to caters to those who are serious or curious about these topics!',
      },
    ],
    managers: ['Ashutosh Pandey', 'Pradeep Kumar'],
  },
  'devroom-documentation-technical-writing': {
    slug: 'docs',
    tagline: 'Read the Manual please',
    about: [
      {
        text: 'This devroom is for people who like to call themselves "documentarians": technical writers, software engineers, documentation architects, content writers, FOSS contributors and maintainers, translators, accessibility advocates, and activists for digital freedom and information access. Eleven sessions across a single morning, on the tooling, the writing, the translation work, the accessibility work, and the people who got into open source through prose rather than patches.',
      },
      {
        text: 'It is also one of the first in-person things Write the Docs India is doing since the chapter restarted, with more to come. If you write documentation in India and have been looking for others who do the same, this is a good place to find them.',
      },
    ],
    managers: ['Srihari Thyagarajan', 'Agriya Khetarpal', 'Sujatha Mohan'],
  },
  'devroom-open-design': {
    slug: 'design',
    tagline: 'All about "design matters"',
    about: [
      {
        text: 'The Open Design Devroom is a space for developers, designers, maintainers, contributors, and curious beginners to come together and explore the intersection of design, open source, and digital commons.',
      },
    ],
    managers: ['Jeswin Jose', 'Muneer S', 'Krutika Thakkannavar'],
  },
  'devroom-open-hardware': {
    slug: 'hardware',
    tagline: 'Building, Hacking, Shipping: Open Hardware for the Next Generation',
    about: [
      {
        text: 'Open-source hardware is a vital but still underrepresented part of the FOSS ecosystem. While open-source software has gone mainstream, open hardware faces unique challenges around cost, manufacturing, sourcing, documentation, licensing, and distribution.',
      },
      {
        text: 'But open hardware in India is at an exciting point. More students are designing their first PCBs, more indie makers are shipping kits, more collectives are forming around building things, and more ambitious open hardware products are reaching global audiences.',
      },
      {
        text: 'This year, we want to shift the focus toward the next generation of builders. The goal is simple: make the devroom a place where people leave thinking, “I can build something too.”',
      },
      {
        heading: 'What We Hope To Do',
      },
      {
        list: [
          'Showcase real-world open hardware projects being built in India and beyond',
          'Give makers, students, and first-time builders a platform to present their work.',
          'Discuss the practical challenges of building and shipping hardware openly.',
          'Share knowledge around PCB design, embedded systems, fabrication, manufacturing, licensing, and documentation.',
          'Strengthen the Indian open hardware community through collaboration and networking.',
          'Help the next open hardware project find its first users, collaborators, or contributors.',
        ],
      },
    ],
    managers: ['Balu Babu', 'Amit G', 'Srinivasan', 'Kailash'],
  },
  'devroom-real-time-operating-systems-rtos': {
    slug: 'rtos',
    tagline:
      'All things related to Free and Open Source Real Time OS, from Kernel to Applications.',
    about: [
      {
        text: "We are excited to organise IndiaFOSS Bengaluru's first ever RTOS Devroom!",
      },
      {
        text: 'The lineup focuses on bridging rich application environments with hard, low-latency RTOS determinism. The speakers tackle everything from transitioning past bare-metal super-loops to architecting multi-core systems with zero-copy video offloading, custom APU-MCU IPC protocols, and remoteproc core lifecycle management. You will gain practical blueprints for isolating time-critical tasks from high-level application loads.',
      },
      {
        text: 'The sessions also highlight open hardware-software co-design, safety-critical microkernel engineering, and native silicon bring-up. Highlights include clean-sheet RTOS design on indigenous AJIT and Calcite processors, lightweight NIST cryptography co-processors on soft-core RISC-V platforms, and upstreaming Infineon TriCore support to Zephyr. Expect actionable engineering insights you can apply directly to your next Real Time embedded project.',
      },
    ],
    managers: ['Sahaj Sarup', 'Khasim Syed Mohammed'],
  },
  'devroom-security': {
    slug: 'security',
    tagline: 'Software, Hardware or Radio. Break it or protect it.',
    about: [
      {
        text: 'Welcome to the Security devroom.',
      },
      {
        text: 'Nine talks made it in this year. Azim and Ayushman will take apart a smart IP camera on stage, from the PCB to the binaries inside it. Gautham and Alwin from bi0s will pull an AES key out of a microcontroller using a ChipWhisperer. serv0id reverse engineered the “encrypted” QR code on the new PAN cards and wrote an open source reader for it. Nisarga is talking about the CBSE exam portal bugs that made the news in May, and what disclosing them to a government body was like. Hamdaan found a way around a security fix in Axios and got a CVE for it. Shreyas (Georgia Tech) has a paper on what age verification vendors actually collect in your browser. And for the people building defences: Saniya on adding script analysis to capa, Philippe Ombredanne on his plan to sort out the CVE mess, and Raunak on building sandboxes from plain Linux primitives.',
      },
      {
        text: 'Bring questions.',
      },
      {
        heading: 'A few practical things',
      },
      {
        list: [
          'Lightning talks are 10 minutes, regular talks are 20, plus 5 minutes for questions. Sessions run back to back, so if you are coming for one talk in particular, come a few minutes early.',
          'A few talks have hardware on the table (camera boards, a ChipWhisperer, flash programmers). Sit up front if you want to see it.',
          'Speakers will hang around after their talks. Go say hi.',
          'The code of conduct applies. Try the techniques on your own hardware, or on things you have permission to poke at.',
        ],
      },
      {
        text: 'Supply chain, hardware and firmware, offensive research, appsec, infra and cloud-native, crypto and privacy, OSINT, radio, and AI security. Basically anything security where the tooling is open.',
      },
    ],
    managers: ['Hritik Vijay', 'Akshansh Jaiswal'],
  },
};
