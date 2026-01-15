import React from 'react';
import { motion } from 'framer-motion';
import { PlaneTakeoff, Menu, Search, Calendar, User, Map as MapIcon, Moon, Sun } from 'lucide-react';
import { ThemeProvider, useTheme } from './components/ThemeContext';
import { MagneticButton } from './components/MagneticButton';
import { TiltCard } from './components/TiltCard';
import { StatusBadge, VersionBadge, TelemetryCard } from './components/Components';
import { TELEMETRY_DATA, DESTINATIONS } from './constants';

const Header = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 dark:border-white/5 bg-white/70 dark:bg-obsidian/70 backdrop-blur-xl transition-colors duration-800">
      <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-8 flex items-center justify-center bg-slate-900 dark:bg-white/5 rounded-md shadow-sm border border-transparent dark:border-white/10">
            <PlaneTakeoff className="text-white dark:text-obsidian-accent w-5 h-5" />
          </div>
          <h1 className="text-slate-900 dark:text-white font-display font-bold text-xl tracking-tight">
            AeroVantage<span className="text-alabaster-accent dark:text-obsidian-accent">.Pro</span>
          </h1>
        </div>

        <nav className="hidden md:flex items-center gap-1">
          {['Flights', 'Stays', 'Charters'].map((item) => (
            <a key={item} href="#" className="px-4 py-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 rounded-md transition-all duration-200">
              {item}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <div className="hidden sm:block">
            <StatusBadge />
          </div>
          <button 
            onClick={toggleTheme}
            className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5 text-white" /> : <Moon className="w-5 h-5 text-slate-700" />}
          </button>
          <div className="h-8 w-8 rounded-md bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 border border-black/5 dark:border-white/10" />
        </div>
      </div>
    </header>
  );
};

const Hero = () => {
  // Staggered text animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.3
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { 
      y: 0, 
      opacity: 1,
      transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } 
    }
  };

  return (
    <section className="w-full flex flex-col items-center text-center max-w-4xl mx-auto mt-20 mb-20 relative px-4">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-alabaster-accent/5 dark:bg-obsidian-accent/10 blur-[100px] rounded-full pointer-events-none z-[-1]" />
      
      <VersionBadge />

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="mb-8"
      >
        <h1 className="text-5xl md:text-7xl font-display font-bold text-slate-900 dark:text-white tracking-tighter leading-[1.1] mb-6 drop-shadow-sm">
          <motion.span variants={itemVariants} className="block">Beyond the Gravity</motion.span>
          <motion.span variants={itemVariants} className="block">
            of the <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-400 dark:from-blue-400 dark:to-cyan-300">Ordinary.</span>
          </motion.span>
        </h1>
        
        <motion.p variants={itemVariants} className="text-lg md:text-xl text-slate-500 dark:text-slate-400 max-w-2xl mx-auto font-body leading-relaxed">
          AeroVantage is the elite protocol for global mobility. Experience a frictionless interface engineered for those who refuse to be grounded.
        </motion.p>
      </motion.div>

      {/* Floating Search Module */}
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.8 }}
        className="w-full relative z-10"
      >
        {/* Weightless Bobbing Animation Wrapper */}
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          <TiltCard className="w-full">
            <div className="relative bg-white/60 dark:bg-[#0f172a]/80 backdrop-blur-3xl rounded-xl shadow-2xl dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] border border-white/20 dark:border-white/10 p-2 flex flex-col md:flex-row gap-2">
              
              {/* Inputs Container */}
              <div className="flex-1 flex flex-col sm:flex-row bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-white/5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-white/5">
                <div className="flex-1 relative flex items-center px-4 h-16 group">
                  <PlaneTakeoff className="text-slate-400 group-focus-within:text-alabaster-accent dark:group-focus-within:text-obsidian-accent transition-colors" />
                  <div className="ml-3 flex flex-col justify-center w-full text-left">
                    <label className="text-[10px] uppercase font-mono text-slate-500 font-medium tracking-wider">Origin</label>
                    <input className="bg-transparent border-none p-0 h-6 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-0 text-sm font-medium w-full font-body outline-none" type="text" defaultValue="New York (JFK)"/>
                  </div>
                </div>
                <div className="flex-1 relative flex items-center px-4 h-16 group">
                   <div className="ml-3 flex flex-col justify-center w-full text-left">
                    <label className="text-[10px] uppercase font-mono text-slate-500 font-medium tracking-wider">Destination</label>
                    <input className="bg-transparent border-none p-0 h-6 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-0 text-sm font-medium w-full font-body outline-none" placeholder="City or Airport" type="text"/>
                  </div>
                </div>
              </div>

              <div className="flex-1 flex flex-col sm:flex-row bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-white/5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-white/5">
                <div className="flex-[1.5] relative flex items-center px-4 h-16 group">
                  <Calendar className="text-slate-400 group-focus-within:text-alabaster-accent dark:group-focus-within:text-obsidian-accent transition-colors" />
                  <div className="ml-3 flex flex-col justify-center w-full text-left">
                    <label className="text-[10px] uppercase font-mono text-slate-500 font-medium tracking-wider">Dates</label>
                    <input className="bg-transparent border-none p-0 h-6 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-0 text-sm font-medium w-full font-body outline-none" type="text" defaultValue="Oct 24 - Nov 02"/>
                  </div>
                </div>
                <div className="flex-1 relative flex items-center px-4 h-16 group">
                  <User className="text-slate-400 group-focus-within:text-alabaster-accent dark:group-focus-within:text-obsidian-accent transition-colors" />
                   <div className="ml-3 flex flex-col justify-center w-full text-left">
                    <label className="text-[10px] uppercase font-mono text-slate-500 font-medium tracking-wider">Travelers</label>
                    <select className="bg-transparent border-none p-0 h-6 text-slate-900 dark:text-white focus:ring-0 text-sm font-medium w-full font-body outline-none cursor-pointer">
                      <option>1 Passenger</option>
                      <option>2 Passengers</option>
                    </select>
                  </div>
                </div>
              </div>

              <MagneticButton />
            </div>
          </TiltCard>
        </motion.div>
      </motion.div>
    </section>
  );
};

const Dashboard = () => {
  return (
    <section className="w-full mb-24 px-6 max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between mb-8 px-2">
        <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white flex items-center gap-3">
          <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>
          Live Telemetry
        </h2>
        <div className="text-xs font-mono text-slate-400">REFRESH RATE: 50MS</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {TELEMETRY_DATA.map((data, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.1 }}
          >
            <TelemetryCard data={data} />
          </motion.div>
        ))}
      </div>
    </section>
  );
};

const DestinationsGrid = () => {
  return (
    <section className="w-full px-6 max-w-[1400px] mx-auto pb-24">
      <div className="flex items-end justify-between mb-8 px-2">
        <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">Curated Coordinates</h2>
        <a href="#" className="text-sm text-alabaster-accent dark:text-obsidian-accent font-medium flex items-center gap-1 group">
          View Global Map 
          <MapIcon size={14} className="group-hover:translate-x-0.5 transition-transform" />
        </a>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {DESTINATIONS.map((dest, i) => (
          <motion.div
            key={dest.id}
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className={i === 0 ? "lg:col-span-2 lg:row-span-2" : ""}
          >
            <TiltCard className="h-full">
              <div className="relative h-full w-full rounded-xl overflow-hidden group shadow-lg dark:shadow-black/50 border border-slate-200/50 dark:border-white/10">
                <div 
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                  style={{ backgroundImage: `url(${dest.image})` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/20 to-transparent" />
                
                <div className="absolute bottom-0 left-0 p-6 w-full">
                   {dest.tag && (
                     <div className="inline-block px-2 py-1 mb-3 bg-white/10 backdrop-blur-md border border-white/20 rounded text-[10px] font-mono text-white uppercase tracking-wider">
                       {dest.tag}
                     </div>
                   )}
                   <div className="flex items-end justify-between">
                     <div>
                       <h3 className={`font-display font-bold text-white ${i === 0 ? 'text-3xl' : 'text-lg'}`}>{dest.name}</h3>
                       <p className={`text-slate-300 ${i === 0 ? 'text-sm mt-1' : 'text-xs font-mono mt-1'}`}>
                         {i === 0 ? "Precision skiing conditions. 240cm base depth." : dest.coords}
                       </p>
                     </div>
                     <div className="text-right">
                        <div className={`font-mono text-white font-medium ${i === 0 ? 'text-2xl' : 'text-sm'}`}>${dest.price}</div>
                        {i === 0 && <div className="text-xs text-slate-400 font-mono">AVG ROUND TRIP</div>}
                     </div>
                   </div>
                </div>
              </div>
            </TiltCard>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

const Footer = () => (
  <footer className="w-full border-t border-slate-200 dark:border-white/5 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md">
    <div className="max-w-[1400px] mx-auto px-6 py-12 flex flex-col md:flex-row justify-between items-start gap-8">
      <div>
        <div className="flex items-center gap-2 mb-4">
          <PlaneTakeoff className="text-slate-400 dark:text-slate-500" />
          <span className="text-slate-900 dark:text-white font-display font-bold text-lg">AeroVantage</span>
        </div>
        <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xs leading-relaxed">
          Engineered for the discerning traveler. <br/>Precision data. Zero compromise.
        </p>
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-12 text-sm">
        <div className="flex flex-col gap-3">
          <span className="text-slate-900 dark:text-white font-semibold font-display">Module</span>
          <a href="#" className="text-slate-500 hover:text-alabaster-accent dark:hover:text-obsidian-accent transition-colors">Flights</a>
          <a href="#" className="text-slate-500 hover:text-alabaster-accent dark:hover:text-obsidian-accent transition-colors">Hotels</a>
        </div>
        <div className="flex flex-col gap-3">
          <span className="text-slate-900 dark:text-white font-semibold font-display">Company</span>
          <a href="#" className="text-slate-500 hover:text-alabaster-accent dark:hover:text-obsidian-accent transition-colors">About</a>
          <a href="#" className="text-slate-500 hover:text-alabaster-accent dark:hover:text-obsidian-accent transition-colors">Enterprise</a>
        </div>
        <div className="flex flex-col gap-3">
          <span className="text-slate-900 dark:text-white font-semibold font-display">Status</span>
          <div className="flex items-center gap-2 text-slate-500 font-mono text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> API: Online
          </div>
          <div className="flex items-center gap-2 text-slate-500 font-mono text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Payments: Online
          </div>
        </div>
      </div>
    </div>
  </footer>
);

export default function App() {
  return (
    <ThemeProvider>
      <div className="min-h-screen w-full bg-alabaster dark:bg-obsidian text-slate-900 dark:text-white transition-colors duration-800 bg-grid-alabaster dark:bg-grid-obsidian bg-[length:40px_40px]">
        <Header />
        <main>
          <Hero />
          <Dashboard />
          <DestinationsGrid />
        </main>
        <Footer />
      </div>
    </ThemeProvider>
  );
}