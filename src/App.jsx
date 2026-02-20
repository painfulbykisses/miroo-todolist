import React, { useState, useEffect, useRef } from 'react';
import {
    Plus,
    ChevronLeft,
    Check,
    Trash2,
    X,
    Clock,
    Bell,
    Sun,
    Moon,
    FolderPlus,
    LogOut,
    Camera,
    Loader2
} from 'lucide-react';

// === FIREBASE IMPORTS ===
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, updateDoc, onSnapshot } from 'firebase/firestore';

// === FIREBASE INITIALIZATION ===
// Memuat konfigurasi dari environment platform secara aman
let app, auth, db, appId;
let isLocalMode = true; // Default to local mode
try {
    if (typeof __firebase_config !== 'undefined' && __firebase_config) {
        const firebaseConfig = JSON.parse(__firebase_config);
        if (firebaseConfig.apiKey) {
            app = initializeApp(firebaseConfig);
            auth = getAuth(app);
            db = getFirestore(app);
            appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            isLocalMode = false;
        }
    }
} catch (error) {
    console.error("Firebase not available, running in local mode.", error);
}

// === LOCAL STORAGE HELPERS ===
const LS_KEYS = {
    profile: 'miroo_profile',
    projects: 'miroo_projects',
    theme: 'miroo_theme',
};

const loadLocal = (key) => {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    } catch { return null; }
};

const saveLocal = (key, data) => {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) { console.error('localStorage save error:', e); }
};

// Blob colors palette for randomly generated new projects
const blobColors = [
    'bg-cyan-500', 'bg-pink-500', 'bg-purple-500',
    'bg-amber-500', 'bg-emerald-500', 'bg-rose-500', 'bg-indigo-500'
];

export default function App() {
    // === STATES ===
    // 1. Firebase Auth State
    const [fbUser, setFbUser] = useState(null);
    const [isAuthLoading, setIsAuthLoading] = useState(true);

    // 2. User Profile State (from Firestore)
    const [currentUser, setCurrentUser] = useState(null);
    const [loginName, setLoginName] = useState('');

    // 3. Data State (from Firestore)
    const [projects, setProjects] = useState([]);

    // 4. UI Preferences
    const [isDarkMode, setIsDarkMode] = useState(true);

    // 5. Navigation & UI States
    const [activeProjectId, setActiveProjectId] = useState(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    // 6. Modal States
    const [isAddingTask, setIsAddingTask] = useState(false);
    const [newTaskText, setNewTaskText] = useState('');
    const [newTaskDesc, setNewTaskDesc] = useState('');
    const [selectedFormProject, setSelectedFormProject] = useState(null);

    const [isAddingProject, setIsAddingProject] = useState(false);
    const [newProjectTitle, setNewProjectTitle] = useState('');
    const [newProjectColor, setNewProjectColor] = useState(blobColors[0]);

    const fileInputRef = useRef(null);

    // === FIREBASE AUTHENTICATION EFFECT ===
    useEffect(() => {
        if (isLocalMode) {
            // Local mode: set a fake user and load profile from localStorage
            setFbUser({ uid: 'local-user' });
            const savedProfile = loadLocal(LS_KEYS.profile);
            if (savedProfile) {
                setCurrentUser(savedProfile);
                if (savedProfile.theme !== undefined) setIsDarkMode(savedProfile.theme);
            }
            const savedProjects = loadLocal(LS_KEYS.projects) || [];
            setProjects(savedProjects);
            if (savedProjects.length > 0) setSelectedFormProject(savedProjects[0]);
            setIsAuthLoading(false);
            return;
        }

        if (!auth) {
            setIsAuthLoading(false);
            return;
        }

        const initAuth = async () => {
            try {
                if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                    await signInWithCustomToken(auth, __initial_auth_token);
                } else {
                    await signInAnonymously(auth);
                }
            } catch (error) {
                console.error("Authentication Error:", error);
                setIsAuthLoading(false);
            }
        };

        initAuth();

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setFbUser(user);
            if (!user) setIsAuthLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // === FIREBASE DATA FETCHING EFFECTS ===
    // 1. Fetch User Profile & Theme Preferences
    useEffect(() => {
        if (isLocalMode || !fbUser || !db) return;

        const profileRef = doc(db, 'artifacts', appId, 'users', fbUser.uid, 'profile', 'data');
        const unsubscribe = onSnapshot(profileRef,
            (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setCurrentUser(data);
                    if (data.theme !== undefined) setIsDarkMode(data.theme);
                } else {
                    setCurrentUser(null);
                }
                setIsAuthLoading(false);
            },
            (error) => {
                console.error("Error fetching profile:", error);
                setIsAuthLoading(false);
            }
        );

        return () => unsubscribe();
    }, [fbUser]);

    // 2. Fetch Projects Collection
    useEffect(() => {
        if (isLocalMode || !fbUser || !currentUser || !db) return;

        const projectsRef = collection(db, 'artifacts', appId, 'users', fbUser.uid, 'projects');
        const unsubscribe = onSnapshot(projectsRef,
            (snapshot) => {
                const fetchedProjects = [];
                snapshot.forEach((doc) => {
                    fetchedProjects.push({ id: doc.id, ...doc.data() });
                });
                // Sort descending by creation time in memory
                fetchedProjects.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                setProjects(fetchedProjects);

                if (!selectedFormProject && fetchedProjects.length > 0) {
                    setSelectedFormProject(fetchedProjects[0]);
                }
            },
            (error) => {
                console.error("Error fetching projects:", error);
            }
        );

        return () => unsubscribe();
    }, [fbUser, currentUser]);

    // === HELPER ===
    const t = (darkClass, lightClass) => (isDarkMode ? darkClass : lightClass);

    const updateTheme = async (isDark) => {
        setIsDarkMode(isDark);
        if (isLocalMode) {
            const profile = loadLocal(LS_KEYS.profile);
            if (profile) saveLocal(LS_KEYS.profile, { ...profile, theme: isDark });
            return;
        }
        if (fbUser && currentUser && db) {
            const profileRef = doc(db, 'artifacts', appId, 'users', fbUser.uid, 'profile', 'data');
            await updateDoc(profileRef, { theme: isDark }).catch(console.error);
        }
    };

    // === PROFILE ACTIONS ===
    const handleLogin = async (e) => {
        e.preventDefault();
        if (!loginName.trim()) return;

        if (isLocalMode) {
            const profile = {
                name: loginName.trim(),
                avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80',
                theme: true,
                createdAt: Date.now()
            };
            saveLocal(LS_KEYS.profile, profile);
            setCurrentUser(profile);
            setIsDarkMode(true);
            setLoginName('');
            return;
        }

        if (!fbUser || !db) return;

        setIsAuthLoading(true);
        try {
            const profileRef = doc(db, 'artifacts', appId, 'users', fbUser.uid, 'profile', 'data');
            await setDoc(profileRef, {
                name: loginName.trim(),
                avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80',
                theme: true, // Default dark mode
                createdAt: Date.now()
            });
            setLoginName('');
        } catch (error) {
            console.error("Error creating profile:", error);
            setIsAuthLoading(false);
        }
    };

    const handleLogout = async () => {
        if (window.confirm("Are you sure you want to reset your profile?")) {
            if (isLocalMode) {
                localStorage.removeItem(LS_KEYS.profile);
                localStorage.removeItem(LS_KEYS.projects);
                setCurrentUser(null);
                setProjects([]);
                return;
            }
            if (!fbUser || !db) return;
            const profileRef = doc(db, 'artifacts', appId, 'users', fbUser.uid, 'profile', 'data');
            await deleteDoc(profileRef);
        }
    };

    const handleAvatarChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = async () => {
            if (isLocalMode) {
                const profile = { ...currentUser, avatarUrl: reader.result };
                saveLocal(LS_KEYS.profile, profile);
                setCurrentUser(profile);
                return;
            }
            if (fbUser && db) {
                const profileRef = doc(db, 'artifacts', appId, 'users', fbUser.uid, 'profile', 'data');
                await updateDoc(profileRef, { avatarUrl: reader.result }).catch(console.error);
            }
        };
        reader.readAsDataURL(file);
    };

    const triggerAvatarUpload = () => {
        fileInputRef.current?.click();
    };

    // === NAVIGATION ===
    const openProject = (id) => {
        setActiveProjectId(id);
        setIsDetailOpen(true);
    };

    const closeProject = () => {
        setIsDetailOpen(false);
        setTimeout(() => setActiveProjectId(null), 500);
    };

    // === DATA ACTIONS (FIRESTORE) ===
    const handleAddProject = async () => {
        if (!newProjectTitle.trim()) return;

        const newProjectId = crypto.randomUUID();
        const newProject = {
            id: newProjectId,
            title: newProjectTitle.trim(),
            tasks: [],
            blobColor: newProjectColor,
            buttonIcon: 'plus',
            createdAt: Date.now()
        };

        setNewProjectTitle('');
        setNewProjectColor(blobColors[0]);
        setIsAddingProject(false);

        if (isLocalMode) {
            const updated = [newProject, ...projects];
            setProjects(updated);
            saveLocal(LS_KEYS.projects, updated);
            if (!selectedFormProject) setSelectedFormProject(newProject);
            return;
        }

        if (!fbUser || !db) return;
        try {
            await setDoc(doc(db, 'artifacts', appId, 'users', fbUser.uid, 'projects', newProjectId), newProject);
        } catch (error) {
            console.error("Error adding project:", error);
        }
    };

    const deleteProject = async (id) => {
        closeProject();

        setTimeout(async () => {
            if (isLocalMode) {
                const updated = projects.filter(p => p.id !== id);
                setProjects(updated);
                saveLocal(LS_KEYS.projects, updated);
                return;
            }
            if (!fbUser || !db) return;
            try {
                await deleteDoc(doc(db, 'artifacts', appId, 'users', fbUser.uid, 'projects', id));
            } catch (error) {
                console.error("Error deleting project:", error);
            }
        }, 400);
    };

    const handleAddTask = async () => {
        if (!newTaskText.trim() || !selectedFormProject) return;

        const newTask = {
            id: crypto.randomUUID(),
            text: newTaskText.trim(),
            description: newTaskDesc.trim(),
            completed: false,
            createdAt: Date.now()
        };

        const targetProject = projects.find(p => p.id === selectedFormProject.id);
        if (!targetProject) return;

        const updatedTasks = [newTask, ...(targetProject.tasks || [])];

        setNewTaskText('');
        setNewTaskDesc('');
        setIsAddingTask(false);

        if (isLocalMode) {
            const updated = projects.map(p =>
                p.id === targetProject.id ? { ...p, tasks: updatedTasks } : p
            );
            setProjects(updated);
            saveLocal(LS_KEYS.projects, updated);
            return;
        }

        if (!fbUser || !db) return;
        try {
            await updateDoc(doc(db, 'artifacts', appId, 'users', fbUser.uid, 'projects', targetProject.id), {
                tasks: updatedTasks
            });
        } catch (error) {
            console.error("Error adding task:", error);
        }
    };

    const toggleTask = async (projectId, taskId) => {
        const targetProject = projects.find(p => p.id === projectId);
        if (!targetProject) return;

        const updatedTasks = targetProject.tasks.map(t =>
            t.id === taskId ? { ...t, completed: !t.completed } : t
        );

        if (isLocalMode) {
            const updated = projects.map(p =>
                p.id === projectId ? { ...p, tasks: updatedTasks } : p
            );
            setProjects(updated);
            saveLocal(LS_KEYS.projects, updated);
            return;
        }

        if (!fbUser || !db) return;
        try {
            await updateDoc(doc(db, 'artifacts', appId, 'users', fbUser.uid, 'projects', projectId), {
                tasks: updatedTasks
            });
        } catch (error) {
            console.error("Error toggling task:", error);
        }
    };

    const deleteTask = async (projectId, taskId) => {
        const targetProject = projects.find(p => p.id === projectId);
        if (!targetProject) return;

        const updatedTasks = targetProject.tasks.filter(t => t.id !== taskId);

        if (isLocalMode) {
            const updated = projects.map(p =>
                p.id === projectId ? { ...p, tasks: updatedTasks } : p
            );
            setProjects(updated);
            saveLocal(LS_KEYS.projects, updated);
            return;
        }

        if (!fbUser || !db) return;
        try {
            await updateDoc(doc(db, 'artifacts', appId, 'users', fbUser.uid, 'projects', projectId), {
                tasks: updatedTasks
            });
        } catch (error) {
            console.error("Error deleting task:", error);
        }
    };

    // === COMPONENTS ===
    const AnimatedBackground = () => (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 rounded-[inherit]">
            <div className={`absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-500/40 rounded-full filter blur-[80px] animate-blob ${t('mix-blend-screen opacity-70', 'mix-blend-multiply opacity-50')}`}></div>
            <div className={`absolute top-[20%] right-[-10%] w-[60%] h-[60%] bg-cyan-400/40 rounded-full filter blur-[80px] animate-blob animation-delay-2000 ${t('mix-blend-screen opacity-70', 'mix-blend-multiply opacity-50')}`}></div>
            <div className={`absolute bottom-[-20%] left-[20%] w-[50%] h-[50%] bg-pink-500/40 rounded-full filter blur-[80px] animate-blob animation-delay-4000 ${t('mix-blend-screen opacity-70', 'mix-blend-multiply opacity-50')}`}></div>
        </div>
    );

    // 0. LOADING & LOGIN VIEW
    const renderLoginView = () => {
        if (isAuthLoading) {
            return (
                <div className={`flex flex-col h-full backdrop-blur-3xl z-20 items-center justify-center p-8 transition-colors duration-500 ${t('bg-black/40', 'bg-white/40')}`}>
                    <Loader2 className={`w-12 h-12 animate-spin mb-4 ${t('text-white', 'text-slate-900')}`} />
                    <p className={`font-medium ${t('text-white/60', 'text-slate-500')}`}>Syncing with iCloud...</p>
                </div>
            );
        }

        return (
            <div className={`flex flex-col h-full backdrop-blur-3xl z-20 items-center justify-center p-8 transition-colors duration-500 ${t('bg-black/40', 'bg-white/40')}`}>
                <div className={`w-32 h-32 rounded-full mb-8 flex items-center justify-center filter blur-[20px] absolute top-20 ${t('bg-cyan-500/30', 'bg-cyan-400/30')}`}></div>
                <div className={`w-40 h-40 rounded-full mb-8 flex items-center justify-center filter blur-[40px] absolute bottom-20 right-10 ${t('bg-pink-500/20', 'bg-pink-400/20')}`}></div>

                <div className={`w-full max-w-sm rounded-[2.5rem] p-8 border backdrop-blur-2xl relative z-10 shadow-2xl ${t('bg-black/40 border-white/10 shadow-black/50', 'bg-white/60 border-white/80 shadow-slate-200/50')
                    }`}>
                    <h1 className={`text-4xl font-bold tracking-tight mb-2 text-center ${t('text-white', 'text-slate-900')}`}>Miroo</h1>
                    <p className={`text-sm text-center mb-8 font-medium ${t('text-white/60', 'text-slate-500')}`}>Clear your list. Clear your mind.</p>

                    <form onSubmit={handleLogin} className="space-y-6">
                        <div>
                            <label className={`block text-xs font-bold uppercase tracking-widest mb-2 ml-2 ${t('text-white/50', 'text-slate-500')}`}>Nickname</label>
                            <input
                                type="text"
                                value={loginName}
                                onChange={(e) => setLoginName(e.target.value)}
                                placeholder="e.g., Michael"
                                className={`w-full border rounded-3xl px-6 py-4 text-[17px] font-medium transition-all outline-none backdrop-blur-md ${t('bg-black/20 border-white/10 text-white placeholder:text-white/30 focus:border-white/40 focus:bg-black/40',
                                    'bg-white/50 border-white/80 text-slate-900 placeholder:text-slate-400 focus:border-white focus:bg-white/80')
                                    }`}
                                autoFocus
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={!loginName.trim()}
                            className={`w-full py-4 rounded-3xl font-semibold text-[17px] tracking-wide transition-all backdrop-blur-md border ${loginName.trim()
                                ? t('bg-white text-black border-transparent hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_20px_rgba(255,255,255,0.3)]',
                                    'bg-slate-900 text-white border-transparent hover:scale-[1.02] active:scale-[0.98] shadow-lg')
                                : t('bg-white/5 text-white/30 border-white/10 cursor-not-allowed shadow-none',
                                    'bg-white/40 text-slate-400 border-white/40 cursor-not-allowed shadow-none')
                                }`}
                        >
                            Start using Miroo
                        </button>
                    </form>
                </div>
            </div>
        );
    };

    // 1. MAIN VIEW (Projects List)
    const renderProjectsView = () => {
        return (
            <div className={`flex-1 flex flex-col h-full backdrop-blur-3xl z-10 transition-colors duration-500 ${t('bg-black/20', 'bg-white/40')}`}>
                {/* Header */}
                <div className="px-6 pt-14 pb-4 flex justify-between items-start shrink-0">
                    <div>
                        <h2 className={`text-sm font-medium mb-1 tracking-wider uppercase transition-colors flex items-center space-x-2 ${t('text-white/60', 'text-slate-500')}`}>
                            <span>Hello, {currentUser?.name}</span>
                        </h2>
                        <h1 className={`text-4xl font-semibold tracking-tight drop-shadow-sm transition-colors ${t('text-white', 'text-slate-900')}`}>
                            Your Projects
                        </h1>
                    </div>

                    <div className="flex items-center space-x-3">
                        <button
                            onClick={() => updateTheme(!isDarkMode)}
                            className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md transition-all active:scale-95 ${t('bg-white/10 border border-white/20 text-white hover:bg-white/20', 'bg-white/60 border border-white/80 text-slate-700 hover:bg-white/80 shadow-sm')}`}
                        >
                            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                        </button>
                        <div className="relative group cursor-pointer" onClick={triggerAvatarUpload}>
                            <div className={`absolute inset-0 rounded-full blur-md ${t('bg-white/30', 'bg-black/10')}`}></div>
                            <img
                                src={currentUser?.avatarUrl}
                                alt={currentUser?.name}
                                className={`relative w-12 h-12 rounded-full object-cover border shadow-lg transition-transform group-hover:scale-105 ${t('border-white/30', 'border-white/80')}`}
                            />
                            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Camera className="w-5 h-5 text-white" />
                            </div>
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleAvatarChange}
                                accept="image/*"
                                className="hidden"
                            />
                        </div>
                    </div>
                </div>

                {/* Action Bar */}
                <div className="px-6 pb-4 flex items-center justify-between shrink-0">
                    <button
                        onClick={() => setIsAddingProject(true)}
                        className={`flex items-center space-x-2 px-4 py-2 rounded-full border backdrop-blur-md transition-all hover:scale-105 active:scale-95 ${t('bg-white/10 border-white/20 text-white hover:bg-white/20', 'bg-white/60 border-white/80 text-slate-800 hover:bg-white/80 shadow-sm')
                            }`}
                    >
                        <FolderPlus className="w-4 h-4" />
                        <span className="text-sm font-semibold">New Project</span>
                    </button>

                    <button
                        onClick={handleLogout}
                        title="Reset Profile"
                        className={`flex items-center space-x-2 px-3 py-2 rounded-full border backdrop-blur-md transition-all hover:scale-105 active:scale-95 ${t('bg-white/5 border-white/10 text-rose-400 hover:bg-white/10', 'bg-white/40 border-white/40 text-rose-500 hover:bg-white/60 shadow-sm')
                            }`}
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>

                {/* Projects Cards List */}
                <div className="px-6 pb-12 space-y-6 flex-1 overflow-y-auto hide-scrollbar z-10">
                    {projects.length === 0 ? (
                        <div className={`flex flex-col items-center justify-center h-48 rounded-3xl border border-dashed ${t('border-white/20 text-white/50', 'border-slate-300 text-slate-400')}`}>
                            <FolderPlus className="w-10 h-10 mb-2 opacity-50" />
                            <p>No projects yet</p>
                        </div>
                    ) : (
                        projects.map((project) => {
                            const completedTasks = project.tasks?.filter((t) => t.completed) || [];
                            const totalTasks = project.tasks?.length || 0;
                            const progress = totalTasks > 0 ? (completedTasks.length / totalTasks) * 100 : 0;

                            return (
                                <div
                                    key={project.id}
                                    onClick={() => openProject(project.id)}
                                    className={`relative w-full h-80 rounded-[2.5rem] p-8 flex flex-col justify-between cursor-pointer transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] overflow-hidden group border ${t('border-white/20 bg-white/5 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)]', 'border-white/60 bg-white/40 shadow-[0_8px_32px_0_rgba(0,0,0,0.1)]')
                                        }`}
                                >
                                    <div className={`absolute inset-0 bg-gradient-to-br backdrop-blur-2xl z-0 ${t('from-white/10 to-transparent', 'from-white/60 to-white/20')}`}></div>
                                    <div className={`absolute -right-10 -top-10 w-48 h-48 ${project.blobColor} rounded-full blur-[60px] opacity-40 group-hover:opacity-60 transition-opacity duration-500`}></div>
                                    <div className={`absolute -left-10 -bottom-10 w-48 h-48 ${project.blobColor} rounded-full blur-[60px] opacity-20 group-hover:opacity-40 transition-opacity duration-500`}></div>

                                    <div className="relative z-10 w-[85%]">
                                        <h2 className={`text-[2.2rem] font-bold leading-[1.15] tracking-tight drop-shadow-md text-pretty ${t('text-white', 'text-slate-900')}`}>
                                            {project.title}
                                        </h2>
                                    </div>

                                    <div className="relative z-10 flex items-end justify-between w-full">
                                        <div className="flex items-center space-x-3">
                                            <div className={`h-[52px] w-[16px] rounded-full p-[3px] flex flex-col justify-end backdrop-blur-md border shadow-inner ${t('bg-black/20 border-white/10', 'bg-black/5 border-white/50')}`}>
                                                <div
                                                    className={`w-full rounded-full transition-all duration-1000 ease-out ${t('bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]', 'bg-slate-800 shadow-[0_0_5px_rgba(0,0,0,0.2)]')}`}
                                                    style={{ height: `${Math.max(15, progress)}%` }}
                                                />
                                            </div>
                                            <div className="flex flex-col drop-shadow-md">
                                                <span className={`text-2xl font-bold leading-none mb-0.5 ${t('text-white', 'text-slate-900')}`}>{completedTasks.length}/{totalTasks}</span>
                                                <span className={`text-xs font-semibold leading-none ${t('text-white/60', 'text-slate-500')}`}>tasks</span>
                                            </div>
                                        </div>

                                        <div className={`w-12 h-12 backdrop-blur-2xl rounded-full flex items-center justify-center border transition-colors ${t('bg-white/10 border-white/20 shadow-[0_4px_16px_rgba(0,0,0,0.2)] hover:bg-white/20 text-white',
                                            'bg-white/60 border-white/80 shadow-[0_4px_16px_rgba(0,0,0,0.05)] hover:bg-white/80 text-slate-800')
                                            }`}>
                                            {project.buttonIcon === 'more' ? (
                                                <Check className="w-6 h-6" strokeWidth={2} />
                                            ) : (
                                                <Plus className="w-6 h-6" strokeWidth={2} />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        );
    };

    // 2. PROJECT DETAIL VIEW
    const renderProjectDetailView = () => {
        const project = projects.find((p) => p.id === activeProjectId) || projects[0];
        if (!project) return null;

        const completedTasks = project.tasks?.filter((t) => t.completed) || [];
        const activeTasks = project.tasks?.filter((t) => !t.completed) || [];
        const totalTasks = project.tasks?.length || 0;
        const progress = totalTasks > 0 ? (completedTasks.length / totalTasks) * 100 : 0;

        return (
            <div className={`flex flex-col h-full backdrop-blur-3xl z-10 shadow-[-20px_0_40px_rgba(0,0,0,0.1)] ${t('bg-[#0a0a0a]/90', 'bg-white/95')}`}>

                <div className="relative flex-shrink-0 z-20 pb-8">

                    <div className={`relative px-6 pt-14 pb-12 rounded-b-[3rem] border-b overflow-hidden ${t('border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.3)] bg-white/5', 'border-white/60 shadow-[0_10px_30px_rgba(0,0,0,0.05)] bg-white/40')
                        }`}>
                        <div className={`absolute inset-0 bg-gradient-to-br backdrop-blur-2xl z-0 ${t('from-white/10 to-transparent', 'from-white/50 to-white/10')}`}></div>
                        <div className={`absolute top-0 right-0 w-64 h-64 ${project.blobColor} rounded-full blur-[80px] opacity-30 mix-blend-screen z-0`}></div>

                        <div className="relative z-10 flex justify-between items-center mb-8">
                            <button
                                onClick={closeProject}
                                className={`w-10 h-10 backdrop-blur-xl rounded-full flex items-center justify-center border transition-transform active:scale-90 ${t('bg-black/20 border-white/10 hover:bg-white/10 text-white', 'bg-white/60 border-white/80 hover:bg-white/80 text-slate-800')
                                    }`}
                            >
                                <ChevronLeft className="w-6 h-6" strokeWidth={1.5} />
                            </button>

                            {/* Delete Project Button */}
                            <button
                                onClick={() => {
                                    if (window.confirm(`Delete project "${project.title}" from cloud?`)) {
                                        deleteProject(project.id);
                                    }
                                }}
                                className={`w-10 h-10 backdrop-blur-xl rounded-full flex items-center justify-center border transition-colors active:scale-90 ${t('bg-black/20 border-white/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-500 hover:border-rose-500/50', 'bg-white/60 border-white/80 hover:bg-rose-50 text-rose-500 hover:border-rose-200')
                                    }`}
                            >
                                <Trash2 className="w-5 h-5" strokeWidth={1.5} />
                            </button>
                        </div>

                        <div className="relative z-10 w-[90%] mb-12">
                            <h1 className={`text-[2.7rem] font-bold leading-[1.1] tracking-tight drop-shadow-lg text-pretty pr-4 ${t('text-white', 'text-slate-900')}`}>
                                {project.title}
                            </h1>
                        </div>

                        <div className="relative z-10 flex items-center space-x-3 drop-shadow-md">
                            <div className={`h-[52px] w-[16px] rounded-full p-[3px] flex flex-col justify-end backdrop-blur-md border shadow-inner ${t('bg-black/30 border-white/10', 'bg-black/5 border-white/50')}`}>
                                <div
                                    className={`w-full rounded-full transition-all duration-1000 ease-out ${t('bg-white shadow-[0_0_12px_rgba(255,255,255,0.9)]', 'bg-slate-800 shadow-[0_0_5px_rgba(0,0,0,0.2)]')}`}
                                    style={{ height: `${Math.max(15, progress)}%` }}
                                />
                            </div>
                            <div className="flex flex-col">
                                <span className={`text-2xl font-bold leading-none mb-0.5 ${t('text-white', 'text-slate-900')}`}>{completedTasks.length}/{totalTasks}</span>
                                <span className={`text-xs font-semibold leading-none ${t('text-white/60', 'text-slate-500')}`}>tasks</span>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={() => {
                            setSelectedFormProject(project);
                            setIsAddingTask(true);
                        }}
                        className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-16 backdrop-blur-xl rounded-full border flex items-center justify-center transition-all z-30 hover:scale-105 active:scale-95 ${t('bg-white/20 text-white border-white/30 shadow-[0_8px_32px_rgba(255,255,255,0.15)] hover:bg-white/30',
                            'bg-white/80 text-slate-900 border-white/100 shadow-[0_8px_32px_rgba(0,0,0,0.1)] hover:bg-white')
                            }`}
                    >
                        <Plus className="w-8 h-8" strokeWidth={1.5} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 pb-10 hide-scrollbar z-10 -mt-4 pt-4">
                    <div className="space-y-3">
                        {activeTasks.length === 0 && completedTasks.length === 0 && (
                            <p className={`text-center mt-8 text-sm ${t('text-white/40', 'text-slate-400')}`}>No tasks yet. Press the + button to add.</p>
                        )}

                        {activeTasks.map((task) => (
                            <div key={task.id} className={`group flex items-center justify-between p-4 backdrop-blur-md border rounded-2xl transition-all duration-300 shadow-sm hover:shadow-md ${t('bg-white/5 hover:bg-white/10 border-white/10', 'bg-white/60 hover:bg-white/80 border-white/80')
                                }`}>
                                <div
                                    className="flex items-center flex-1 min-w-0 pr-4 cursor-pointer"
                                    onClick={() => toggleTask(project.id, task.id)}
                                >
                                    <div className={`flex-shrink-0 w-6 h-6 rounded-full border flex items-center justify-center mr-4 transition-all duration-200 ${t('border-white/40 group-hover:border-white', 'border-slate-400 group-hover:border-slate-800')
                                        }`}>
                                        <Check className="w-3.5 h-3.5 text-transparent" strokeWidth={3} />
                                    </div>
                                    <span className={`text-[16px] font-medium truncate ${t('text-white/90', 'text-slate-800')}`}>
                                        {task.text}
                                    </span>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); deleteTask(project.id, task.id); }}
                                    className={`p-2 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 rounded-full backdrop-blur-md ${t('text-white/40 hover:text-rose-400 bg-black/20', 'text-slate-400 hover:text-rose-500 bg-white/50')
                                        }`}
                                >
                                    <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                                </button>
                            </div>
                        ))}
                    </div>

                    {completedTasks.length > 0 && (
                        <div className="mt-8 mb-4">
                            <div className={`flex items-center justify-between text-[11px] font-bold uppercase tracking-widest mb-3 px-2 ${t('text-white/40', 'text-slate-500')}`}>
                                <span>Completed ({completedTasks.length})</span>
                                <ChevronLeft className="w-4 h-4 -rotate-90" strokeWidth={2} />
                            </div>

                            <div className="space-y-3">
                                {completedTasks.map((task) => (
                                    <div key={task.id} className={`group flex items-center justify-between p-4 backdrop-blur-sm border rounded-2xl transition-all opacity-60 hover:opacity-100 ${t('bg-black/10 border-white/5', 'bg-white/30 border-white/40')
                                        }`}>
                                        <div
                                            className="flex items-center flex-1 min-w-0 pr-4 cursor-pointer"
                                            onClick={() => toggleTask(project.id, task.id)}
                                        >
                                            <div className={`flex-shrink-0 w-6 h-6 rounded-full border-none flex items-center justify-center mr-4 ${t('bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]', 'bg-slate-800 shadow-sm')
                                                }`}>
                                                <Check className={`w-3.5 h-3.5 ${t('text-black', 'text-white')}`} strokeWidth={3} />
                                            </div>
                                            <span className={`text-[16px] font-medium line-through ${t('text-white/50 decoration-white/30', 'text-slate-500 decoration-slate-400')}`}>
                                                {task.text}
                                            </span>
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); deleteTask(project.id, task.id); }}
                                            className={`p-2 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 rounded-full ${t('text-white/30 hover:text-rose-400 bg-black/20', 'text-slate-400 hover:text-rose-500 bg-white/50')
                                                }`}
                                        >
                                            <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // 3. NEW TASK MODAL
    const renderNewTaskModal = () => {
        if (!isAddingTask) return null;

        return (
            <div className="absolute inset-0 z-50 flex items-end sm:items-center justify-center">
                <div
                    className={`absolute inset-0 backdrop-blur-md transition-opacity ${t('bg-black/40', 'bg-slate-900/20')}`}
                    onClick={() => setIsAddingTask(false)}
                />

                <div className={`w-full h-[90vh] sm:h-[85vh] sm:max-w-md rounded-t-[3rem] sm:rounded-[3rem] relative flex flex-col animate-slide-up overflow-hidden backdrop-blur-3xl border ${t('bg-white/10 border-white/20 shadow-[0_-10px_50px_rgba(0,0,0,0.5)]', 'bg-white/70 border-white/100 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]')
                    }`}>
                    <div className="w-full flex justify-center pt-4 pb-2">
                        <div className={`w-12 h-1.5 rounded-full ${t('bg-white/30', 'bg-black/20')}`}></div>
                    </div>

                    <div className="px-6 pt-2 pb-4 flex justify-between items-center shrink-0">
                        <button
                            onClick={() => setIsAddingTask(false)}
                            className={`w-10 h-10 flex items-center justify-center rounded-full border transition-colors ${t('bg-white/10 border-white/10 hover:bg-white/20 text-white', 'bg-white/50 border-white/80 hover:bg-white/80 text-slate-700')
                                }`}
                        >
                            <X className="w-5 h-5" strokeWidth={1.5} />
                        </button>
                    </div>

                    <div className="px-6 flex-1 overflow-y-auto hide-scrollbar pb-8">
                        <h2 className={`text-[2.2rem] font-semibold mb-8 tracking-tight drop-shadow-md ${t('text-white', 'text-slate-900')}`}>New Task</h2>

                        <div className="mb-8">
                            <label className={`block text-[11px] font-medium uppercase tracking-widest mb-3 ${t('text-white/50', 'text-slate-500')}`}>
                                PROJECT
                            </label>
                            <div className="flex items-center space-x-3 overflow-x-auto hide-scrollbar pb-2 -mx-6 px-6">
                                <button
                                    onClick={() => {
                                        setIsAddingTask(false);
                                        setIsAddingProject(true);
                                    }}
                                    className={`flex-shrink-0 w-12 h-11 flex items-center justify-center rounded-full border transition-colors ${t('bg-black/20 border-white/10 text-white/70 hover:bg-white/10', 'bg-white/50 border-white/80 text-slate-600 hover:bg-white/80')
                                        }`}
                                >
                                    <FolderPlus className="w-5 h-5" strokeWidth={1.5} />
                                </button>
                                {projects.map(p => {
                                    const isSelected = selectedFormProject?.id === p.id;
                                    return (
                                        <button
                                            key={p.id}
                                            onClick={() => setSelectedFormProject(p)}
                                            className={`flex-shrink-0 px-5 py-2.5 rounded-full text-[15px] font-medium whitespace-nowrap transition-all duration-300 border ${isSelected
                                                ? t('bg-white/20 border-white text-white shadow-[0_0_15px_rgba(255,255,255,0.2)] backdrop-blur-md', 'bg-white border-white text-slate-900 shadow-sm backdrop-blur-md')
                                                : t('bg-black/20 border-white/10 text-white/70 hover:bg-white/10', 'bg-white/30 border-white/60 text-slate-600 hover:bg-white/60')
                                                }`}
                                        >
                                            {p.title}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className={`block text-[11px] font-medium uppercase tracking-widest mb-3 ${t('text-white/50', 'text-slate-500')}`}>
                                TITLE
                            </label>
                            <input
                                type="text"
                                value={newTaskText}
                                onChange={(e) => setNewTaskText(e.target.value)}
                                placeholder="Buy travel insurance"
                                className={`w-full border rounded-3xl px-6 py-4 text-[17px] font-medium transition-all outline-none backdrop-blur-md ${t('bg-black/20 border-white/10 text-white placeholder:text-white/30 focus:border-white/40 focus:bg-black/40',
                                    'bg-white/50 border-white/80 text-slate-900 placeholder:text-slate-400 focus:border-white focus:bg-white/80')
                                    }`}
                                autoFocus
                            />
                        </div>
                        <div className="mb-8">
                            <input
                                type="text"
                                value={newTaskDesc}
                                onChange={(e) => setNewTaskDesc(e.target.value)}
                                placeholder="Description (optional)"
                                className={`w-full border rounded-3xl px-6 py-4 text-[15px] font-medium transition-all outline-none backdrop-blur-md ${t('bg-black/20 border-white/10 text-white placeholder:text-white/30 focus:border-white/40 focus:bg-black/40',
                                    'bg-white/50 border-white/80 text-slate-900 placeholder:text-slate-400 focus:border-white focus:bg-white/80')
                                    }`}
                            />
                        </div>
                    </div>

                    <div className={`p-6 backdrop-blur-xl border-t shrink-0 pb-8 sm:pb-6 ${t('bg-black/20 border-white/10', 'bg-white/40 border-white/40')}`}>
                        <button
                            onClick={handleAddTask}
                            disabled={!newTaskText.trim()}
                            className={`w-full py-4 rounded-full font-semibold text-[17px] tracking-wide transition-all backdrop-blur-md border ${newTaskText.trim()
                                ? t('bg-white text-black border-transparent hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_20px_rgba(255,255,255,0.3)]',
                                    'bg-slate-900 text-white border-transparent hover:scale-[1.02] active:scale-[0.98] shadow-lg')
                                : t('bg-white/5 text-white/30 border-white/10 cursor-not-allowed shadow-none',
                                    'bg-white/40 text-slate-400 border-white/40 cursor-not-allowed shadow-none')
                                }`}
                        >
                            Create Task
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // 4. NEW PROJECT MODAL
    const renderNewProjectModal = () => {
        if (!isAddingProject) return null;

        return (
            <div className="absolute inset-0 z-50 flex items-end sm:items-center justify-center">
                <div
                    className={`absolute inset-0 backdrop-blur-md transition-opacity ${t('bg-black/40', 'bg-slate-900/20')}`}
                    onClick={() => setIsAddingProject(false)}
                />

                <div className={`w-full h-[65vh] sm:h-[60vh] sm:max-w-md rounded-t-[3rem] sm:rounded-[3rem] relative flex flex-col animate-slide-up overflow-hidden backdrop-blur-3xl border ${t('bg-white/10 border-white/20 shadow-[0_-10px_50px_rgba(0,0,0,0.5)]', 'bg-white/70 border-white/100 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]')
                    }`}>
                    <div className="w-full flex justify-center pt-4 pb-2">
                        <div className={`w-12 h-1.5 rounded-full ${t('bg-white/30', 'bg-black/20')}`}></div>
                    </div>

                    <div className="px-6 pt-2 pb-4 flex justify-between items-center shrink-0">
                        <button
                            onClick={() => setIsAddingProject(false)}
                            className={`w-10 h-10 flex items-center justify-center rounded-full border transition-colors ${t('bg-white/10 border-white/10 hover:bg-white/20 text-white', 'bg-white/50 border-white/80 hover:bg-white/80 text-slate-700')
                                }`}
                        >
                            <X className="w-5 h-5" strokeWidth={1.5} />
                        </button>
                    </div>

                    <div className="px-6 flex-1 overflow-y-auto hide-scrollbar pb-8">
                        <h2 className={`text-[2.2rem] font-semibold mb-8 tracking-tight drop-shadow-md ${t('text-white', 'text-slate-900')}`}>New Project</h2>

                        <div className="mb-4">
                            <label className={`block text-[11px] font-medium uppercase tracking-widest mb-3 ${t('text-white/50', 'text-slate-500')}`}>
                                PROJECT NAME
                            </label>
                            <input
                                type="text"
                                value={newProjectTitle}
                                onChange={(e) => setNewProjectTitle(e.target.value)}
                                placeholder="e.g., Grocery Shopping"
                                className={`w-full border rounded-3xl px-6 py-4 text-[17px] font-medium transition-all outline-none backdrop-blur-md ${t('bg-black/20 border-white/10 text-white placeholder:text-white/30 focus:border-white/40 focus:bg-black/40',
                                    'bg-white/50 border-white/80 text-slate-900 placeholder:text-slate-400 focus:border-white focus:bg-white/80')
                                    }`}
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && handleAddProject()}
                            />
                        </div>

                        <div className="mb-4 mt-6">
                            <label className={`block text-[11px] font-medium uppercase tracking-widest mb-3 ${t('text-white/50', 'text-slate-500')}`}>
                                THEME COLOR
                            </label>
                            <div className="flex items-center space-x-3 overflow-x-auto hide-scrollbar pb-2 -mx-6 px-6">
                                {blobColors.map(colorClass => (
                                    <button
                                        key={colorClass}
                                        onClick={() => setNewProjectColor(colorClass)}
                                        className={`flex-shrink-0 w-12 h-12 rounded-full ${colorClass} flex items-center justify-center transition-all duration-300 ${newProjectColor === colorClass
                                            ? 'scale-110 shadow-lg'
                                            : 'opacity-50 hover:opacity-100 hover:scale-105'
                                            }`}
                                    >
                                        {newProjectColor === colorClass && <Check className="w-6 h-6 text-white drop-shadow-md" />}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className={`p-6 backdrop-blur-xl border-t shrink-0 pb-8 sm:pb-6 ${t('bg-black/20 border-white/10', 'bg-white/40 border-white/40')}`}>
                        <button
                            onClick={handleAddProject}
                            disabled={!newProjectTitle.trim()}
                            className={`w-full py-4 rounded-full font-semibold text-[17px] tracking-wide transition-all backdrop-blur-md border ${newProjectTitle.trim()
                                ? t('bg-white text-black border-transparent hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_20px_rgba(255,255,255,0.3)]',
                                    'bg-slate-900 text-white border-transparent hover:scale-[1.02] active:scale-[0.98] shadow-lg')
                                : t('bg-white/5 text-white/30 border-white/10 cursor-not-allowed shadow-none',
                                    'bg-white/40 text-slate-400 border-white/40 cursor-not-allowed shadow-none')
                                }`}
                        >
                            Create Project
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className={`min-h-screen flex items-center justify-center p-0 sm:p-6 font-sans relative overflow-hidden transition-colors duration-700 ${t('bg-[#0a0a0a] selection:bg-white/30 selection:text-white', 'bg-[#f0f2f5] selection:bg-black/20 selection:text-black')
            }`}>

            {/* Background Mesh Global */}
            <div className={`absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] transition-colors duration-700 ${t('from-indigo-900/40 via-[#0a0a0a] to-[#0a0a0a]', 'from-indigo-200/50 via-[#f0f2f5] to-[#f0f2f5]')
                }`}></div>

            <style dangerouslySetInnerHTML={{
                __html: `
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(100%); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob {
          animation: blob 10s infinite alternate cubic-bezier(0.4, 0, 0.2, 1);
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />

            {/* Main Application Container */}
            <div className={`w-full max-w-[400px] rounded-none sm:rounded-[3.5rem] overflow-hidden flex flex-col h-[100dvh] sm:h-[850px] relative border-[0.5px] backdrop-blur-3xl z-10 transition-colors duration-500 ${t('shadow-[0_0_50px_rgba(0,0,0,0.8)] border-white/20 bg-black/40', 'shadow-[0_20px_50px_rgba(0,0,0,0.1)] border-white/80 bg-white/50')
                }`}>

                <AnimatedBackground />

                {/* Check Login/Auth Profile */}
                {!currentUser ? (
                    renderLoginView()
                ) : (
                    <>
                        <div className="relative flex-1 w-full h-full overflow-hidden">
                            <div
                                className={`absolute inset-0 flex flex-col transition-all duration-[500ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${isDetailOpen ? '-translate-x-1/4 scale-95 opacity-30 pointer-events-none' : 'translate-x-0 scale-100 opacity-100'
                                    }`}
                            >
                                {renderProjectsView()}
                            </div>

                            <div
                                className={`absolute inset-0 flex flex-col transition-all duration-[500ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${isDetailOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none opacity-0'
                                    }`}
                            >
                                {activeProjectId && renderProjectDetailView()}
                            </div>
                        </div>

                        {renderNewTaskModal()}
                        {renderNewProjectModal()}
                    </>
                )}
            </div>
        </div>
    );
}
