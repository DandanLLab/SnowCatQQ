import { Modal, ModalContent, ModalHeader } from '@heroui/modal';
import toast from 'react-hot-toast';

import useConfig from '@/hooks/use-config';
import useDialog from '@/hooks/use-dialog';

import HTTPClientForm from './http_client';
import HTTPServerForm from './http_server';
import HTTPServerSSEForm from './http_sse';
import McpServerForm from './mcp_server';
import MilkyServerForm from './milky_server';
import WebsocketClientForm from './ws_client';
import WebsocketServerForm from './ws_server';

const modalTitle = {
  httpServers: 'HTTP Server',
  httpClients: 'HTTP Client',
  httpSseServers: 'HTTP SSE Server',
  websocketServers: 'Websocket Server',
  websocketClients: 'Websocket Client',
  mcpServers: 'MCP Server',
  milkyServers: 'Milky Server',
};

export interface NetworkFormModalProps<
  T extends keyof OneBotConfig['network']
> {
  isOpen: boolean;
  field: T;
  data?: OneBotConfig['network'][T][0];
  onOpenChange: (isOpen: boolean) => void;
}

const NetworkFormModal = <T extends keyof OneBotConfig['network']> (
  props: NetworkFormModalProps<T>
) => {
  const { isOpen, onOpenChange, field, data } = props;
  const { createNetworkConfig, updateNetworkConfig } = useConfig();
  const dialog = useDialog();
  const isCreate = !data;

  const onSubmit = async (data: OneBotConfig['network'][typeof field][0]) => {
    const saveData = async (dataToSave: OneBotConfig['network'][typeof field][0]) => {
      try {
        if (isCreate) {
          await createNetworkConfig(field, dataToSave);
        } else {
          await updateNetworkConfig(field, dataToSave);
        }
        toast.success('保存配置成功');
      } catch (error) {
        const msg = (error as Error).message;

        toast.error(`保存配置失败: ${msg}`);

        throw error;
      }
    };

    if (['httpServers', 'httpSseServers', 'websocketServers'].includes(field)) {
      const serverData = data as any;
      if (!serverData.token && serverData.host !== '127.0.0.1') {
        await new Promise<void>((resolve, reject) => {
          dialog.confirm({
            title: '安全警告',
            content: (
              <div>
                <p>检测到未配置Token，这可能导致安全风险。确认要继续吗？</p>
                <p className='text-sm text-gray-500 mt-2'>(未配置Token时，Host将被强制限制为 127.0.0.1)</p>
              </div>
            ),
            onConfirm: async () => {
              serverData.host = '127.0.0.1';
              try {
                await saveData(serverData);
                resolve();
              } catch (e) {
                reject(e);
              }
            },
            onCancel: () => {
              reject(new Error('Cancelled'));
            },
          });
        });
        return;
      }
    }
    await saveData(data);
  };

  const renderFormComponent = (onClose: () => void) => {
    switch (field) {
      case 'httpServers':
        return (
          <HTTPServerForm
            data={data as OneBotConfig['network']['httpServers'][0]}
            onClose={onClose}
            onSubmit={onSubmit}
          />
        );
      case 'httpClients':
        return (
          <HTTPClientForm
            data={data as OneBotConfig['network']['httpClients'][0]}
            onClose={onClose}
            onSubmit={onSubmit}
          />
        );
      case 'websocketServers':
        return (
          <WebsocketServerForm
            data={data as OneBotConfig['network']['websocketServers'][0]}
            onClose={onClose}
            onSubmit={onSubmit}
          />
        );
      case 'websocketClients':
        return (
          <WebsocketClientForm
            data={data as OneBotConfig['network']['websocketClients'][0]}
            onClose={onClose}
            onSubmit={onSubmit}
          />
        );
      case 'httpSseServers':
        return (
          <HTTPServerSSEForm
            data={data as OneBotConfig['network']['httpSseServers'][0]}
            onClose={onClose}
            onSubmit={onSubmit}
          />
        );
      case 'mcpServers':
        return (
          <McpServerForm
            data={data as OneBotConfig['network']['mcpServers'][0]}
            onClose={onClose}
            onSubmit={onSubmit}
          />
        );
      case 'milkyServers':
        return (
          <MilkyServerForm
            data={data as OneBotConfig['network']['milkyServers'][0]}
            onClose={onClose}
            onSubmit={onSubmit}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Modal
      backdrop='blur'
      isDismissable={false}
      isOpen={isOpen}
      size='lg'
      scrollBehavior='outside'
      onOpenChange={onOpenChange}
    >
      <ModalContent className='rounded-3xl border border-white/70 dark:border-white/10 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl shadow-2xl shadow-primary-900/10'>
        {(onClose) => (
          <>
            <ModalHeader className='flex flex-col gap-1 pb-2'>
              <span className='text-lg font-semibold tracking-tight'>{modalTitle[field]}</span>
              <span className='text-tiny font-normal text-default-400'>
                {isCreate ? '新建一个接入点' : `编辑「${data?.name ?? ''}」`}
              </span>
            </ModalHeader>
            {renderFormComponent(onClose)}
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default NetworkFormModal;
