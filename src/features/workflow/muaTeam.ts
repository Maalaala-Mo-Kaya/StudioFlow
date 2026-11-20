export interface MuaTeam {
  parentId?: string;
  allowSelf?: boolean;
  manage: boolean;
  canClaim: boolean;
  date: string;
  today: string;
  artists: {
    id: string;
    name: string;
    disabled: boolean;
    parent: boolean;
    pending: number;
    inProgress: number;
    completed: number;
  }[];
}
