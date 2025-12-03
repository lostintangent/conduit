export type VMMetadata = {
  vmId: string;
  vmHost: string;
  sshPort: number;
  imageId: string;
  useSSHKey?: boolean;
};

export type CreateVMPayload = {
  image?: string;
  labels?: string[];
  idle_timeout?: number;
  github_repo?: {
    owner: string;
    name: string;
    branch_or_hash?: string;
    clone_path?: string;
  };
};

export type ListVMsPayload = {
  labels?: string[];
};

export type DeleteVMPayload = {
  vmId: string;
};

export type ForkVMPayload = {
  vmId: string;
  labels?: string[];
  idle_timeout?: number;
};

export type ForwardPortPayload = {
  vmId: string;
  port: number;
  description?: string;
};

export type ForwardPortResponse = {
  message: string;
  external_port: string;
  connection_url: string;
};

export type VMState = "Running" | "Paused" | "Stopped";

export type VMInfo = {
  id: string;
  ip_address: string;
  image_id: string;
  created_at: string;
  state: VMState;
  forwarded_ports: {
    [port: string]: {
      connection_url: string;
      external_port: string;
      description: string;
    };
  };
};
