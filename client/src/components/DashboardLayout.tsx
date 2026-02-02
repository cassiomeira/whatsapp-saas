import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { APP_LOGO, APP_TITLE, getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { LayoutDashboard, LogOut, PanelLeft, Users, MessageSquare, Bot, Workflow, BarChart3, Settings, PhoneCall, Megaphone, UserCog, Package, Sun, Moon, HardDrive, LayoutGrid, LayoutList, MessageCircle } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";

const getMenuItems = (userRole?: string | null) => {
  const items = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    { icon: MessageSquare, label: "Caixa de Entrada", path: "/inbox" },
    { icon: Users, label: "Contatos", path: "/contacts" },
    { icon: Users, label: "Grupos", path: "/groups" },
    { icon: BarChart3, label: "Atendimento", path: "/kanban" },
    { icon: PhoneCall, label: "WhatsApp", path: "/whatsapp" },
    { icon: Package, label: "Produtos", path: "/products" },
    { icon: Bot, label: "Configurar IA", path: "/bot" },
    { icon: Workflow, label: "Fluxos", path: "/flows" },
    { icon: Megaphone, label: "Campanhas", path: "/campaigns" },
  ];

  // Adicionar "Usuários" apenas para owner
  if (userRole === "owner") {
    items.push({ icon: UserCog, label: "Usuários", path: "/users" });
  }

  items.push({ icon: HardDrive, label: "Armazenamento", path: "/storage" });
  items.push({ icon: Settings, label: "Configurações", path: "/settings" });

  return items;
};

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <div className="relative group">
              <div className="relative">
                <img
                  src={APP_LOGO}
                  alt={APP_TITLE}
                  className="h-20 w-20 rounded-xl object-cover shadow"
                />
              </div>
            </div>
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">{APP_TITLE}</h1>
              <p className="text-sm text-muted-foreground">
                Please sign in to continue
              </p>
            </div>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme, switchable } = useTheme();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // View mode: simple or advanced (default: simple)
  const [viewMode, setViewMode] = useState<'simple' | 'advanced'>(() => {
    const saved = localStorage.getItem('view-mode');
    return (saved as 'simple' | 'advanced') || 'simple';
  });

  const toggleViewMode = () => {
    const newMode = viewMode === 'simple' ? 'advanced' : 'simple';
    setViewMode(newMode);
    localStorage.setItem('view-mode', newMode);
  };

  // Filtrar menu baseado no modo
  const allMenuItems = getMenuItems(user?.workspaceRole);
  const simpleMenuPaths = ['/contacts', '/kanban', '/products', '/groups'];
  const menuItems = viewMode === 'simple'
    ? allMenuItems.filter(item => simpleMenuPaths.includes(item.path))
    : allMenuItems;
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  const workspaceLogo =
    (user?.workspaceMetadata as { logoDataUrl?: string })?.logoDataUrl || APP_LOGO;

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 pl-2 group-data-[collapsible=icon]:px-0 transition-all w-full">
              {isCollapsed ? (
                <div className="relative h-8 w-8 shrink-0 group">
                  {workspaceLogo ? (
                    <img
                      src={workspaceLogo}
                      className="h-8 w-8 rounded-md object-cover ring-1 ring-border"
                      alt="Logo"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center text-sm font-semibold">
                      {APP_TITLE.charAt(0)}
                    </div>
                  )}
                  <button
                    onClick={toggleSidebar}
                    className="absolute inset-0 flex items-center justify-center bg-accent rounded-md ring-1 ring-border opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <PanelLeft className="h-4 w-4 text-foreground" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 min-w-0">
                    {workspaceLogo ? (
                      <img
                        src={workspaceLogo}
                        className="h-8 w-8 rounded-md object-cover ring-1 ring-border shrink-0"
                        alt="Logo"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center text-sm font-semibold shrink-0">
                        {APP_TITLE.charAt(0)}
                      </div>
                    )}
                    <span className="font-semibold tracking-tight truncate">
                      {APP_TITLE}
                    </span>
                  </div>
                  <button
                    onClick={toggleSidebar}
                    className="ml-auto h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                  >
                    <PanelLeft className="h-4 w-4 text-muted-foreground" />
                  </button>
                </>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {menuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-10 transition-all font-normal`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3 space-y-2">
            {/* Toggle View Mode Button */}
            <button
              onClick={toggleViewMode}
              className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={viewMode === 'simple' ? 'Modo Avançado' : 'Modo Simplificado'}
            >
              {viewMode === 'simple' ? (
                <LayoutList className="h-4 w-4 shrink-0" />
              ) : (
                <LayoutGrid className="h-4 w-4 shrink-0" />
              )}
              <span className="text-sm group-data-[collapsible=icon]:hidden">
                {viewMode === 'simple' ? 'Modo Avançado' : 'Modo Simplificado'}
              </span>
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? APP_TITLE}
                  </span>
                </div>
              </div>
            </div>
            {switchable && toggleTheme && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={toggleTheme}
              >
                {theme === "light" ? (
                  <Moon className="h-4 w-4" />
                ) : theme === "dark" ? (
                  <MessageCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <Sun className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        )}

        {!isMobile && switchable && toggleTheme && (
          <div className="hidden md:flex justify-end items-center h-14 border-b bg-background/80 px-6 sticky top-0 z-30 backdrop-blur">
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
              onClick={toggleTheme}
            >
              {theme === "light" ? (
                <>
                  <Moon className="h-4 w-4" />
                  <span>Modo escuro</span>
                </>
              ) : theme === "dark" ? (
                <>
                  <MessageCircle className="h-4 w-4 text-green-500" />
                  <span>Modo WhatsApp</span>
                </>
              ) : (
                <>
                  <Sun className="h-4 w-4" />
                  <span>Modo claro</span>
                </>
              )}
            </Button>
          </div>
        )}

        <main className="flex-1 p-4">{children}</main>
      </SidebarInset>
    </>
  );
}
