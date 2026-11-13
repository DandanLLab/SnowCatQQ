import { Button } from '@heroui/button';
import { useDisclosure } from '@heroui/modal';
import { Tab, Tabs } from '@heroui/tabs';
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { IoMdRefresh } from 'react-icons/io';

import AddButton from '@/components/button/add_button';
import HTTPClientDisplayCard from '@/components/display_card/http_client';
import HTTPServerDisplayCard from '@/components/display_card/http_server';
import HTTPSSEServerDisplayCard from '@/components/display_card/http_sse_server';
import McpServerDisplayCard from '@/components/display_card/mcp_server';
import MilkyServerDisplayCard from '@/components/display_card/milky_server';
import WebsocketClientDisplayCard from '@/components/display_card/ws_client';
import WebsocketServerDisplayCard from '@/components/display_card/ws_server';
import EmptyState from '@/components/empty_state';
import NetworkFormModal from '@/components/network_edit/modal';
import PageHeader from '@/components/page_header';
import PageLoading from '@/components/page_loading';
import { LuSignal } from 'react-icons/lu';

import useConfig from '@/hooks/use-config';
import useDialog from '@/hooks/use-dialog';
import { getNetworkList } from '@/utils/config';

export interface SectionProps {
  title: string;
  color?:
  | 'violet'
  | 'yellow'
  | 'blue'
  | 'cyan'
  | 'green'
  | 'pink'
  | 'foreground';
  icon: React.ReactNode;
  children: React.ReactNode;
}

export interface EmptySectionProps {
  isEmpty: boolean;
}

const EmptySection: React.FC<EmptySectionProps> = ({ isEmpty }) => {
  return (
    <div className={clsx(isEmpty ? 'block' : 'hidden')}>
      <EmptyState
        compact
        icon={<LuSignal size={20} />}
        title='这一栏还是空的'
        description='点击右上角「新增」添加第一个接入点'
      />
    </div>
  );
};

export default function NetworkPage () {
  const {
    config,
    refreshConfig,
    deleteNetworkConfig,
    enableNetworkConfig,
    enableDebugNetworkConfig,
  } = useConfig();
  const [activeField, setActiveField] =
    useState<keyof OneBotConfig['network']>('httpServers');
  const [activeName, setActiveName] = useState<string>('');
  const {
    network: {
      httpServers = [],
      httpClients = [],
      httpSseServers = [],
      websocketServers = [],
      websocketClients = [],
      mcpServers = [],
      milkyServers = [],
    } = {},
  } = config;
  const [loading, setLoading] = useState(false);
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const dialog = useDialog();
  const activeData = useMemo(() => {
    const findData = getNetworkList(config, activeField).find(
      (item) => item.name === activeName
    );

    return findData;
  }, [activeField, activeName, config]);

  const refresh = async () => {
    setLoading(true);
    try {
      await refreshConfig();
      setLoading(false);
    } catch (error) {
      const msg = (error as Error).message;

      toast.error(`获取配置失败: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClickCreate = (key: keyof OneBotConfig['network']) => {
    setActiveField(key);
    setActiveName('');
    onOpen();
  };

  const onDelete = async (
    field: keyof OneBotConfig['network'],
    name: string
  ) => {
    return new Promise<void>((resolve, reject) => {
      dialog.confirm({
        title: '删除配置',
        content: `确定要删除配置「${name}」吗?`,
        onConfirm: async () => {
          try {
            await deleteNetworkConfig(field, name);
            toast.success('删除配置成功');
            resolve();
          } catch (error) {
            const msg = (error as Error).message;

            toast.error(`删除配置失败: ${msg}`);

            reject(error);
          }
        },
        onCancel: () => {
          resolve();
        },
      });
    });
  };

  const onEnable = async (
    field: keyof OneBotConfig['network'],
    name: string
  ) => {
    try {
      await enableNetworkConfig(field, name);
      toast.success('更新配置成功');
    } catch (error) {
      const msg = (error as Error).message;

      toast.error(`更新配置失败: ${msg}`);

      throw error;
    }
  };

  const onEnableDebug = async (
    field: keyof OneBotConfig['network'],
    name: string
  ) => {
    try {
      await enableDebugNetworkConfig(field, name);
      toast.success('更新配置成功');
    } catch (error) {
      const msg = (error as Error).message;

      toast.error(`更新配置失败: ${msg}`);

      throw error;
    }
  };

  const onEdit = (field: keyof OneBotConfig['network'], name: string) => {
    setActiveField(field);
    setActiveName(name);
    onOpen();
  };

  const renderCard = <T extends keyof OneBotConfig['network']> (
    type: T,
    item: OneBotConfig['network'][T][0],
    showType = false
  ) => {
    switch (type) {
      case 'httpServers':
        return (
          <HTTPServerDisplayCard
            key={item.name}
            showType={showType}
            data={item as OneBotConfig['network']['httpServers'][0]}
            onDelete={async () => {
              await onDelete('httpServers', item.name);
            }}
            onEdit={() => {
              onEdit('httpServers', item.name);
            }}
            onEnable={async () => {
              await onEnable('httpServers', item.name);
            }}
            onEnableDebug={async () => {
              await onEnableDebug('httpServers', item.name);
            }}
          />
        );
      case 'httpClients':
        return (
          <HTTPClientDisplayCard
            key={item.name}
            showType={showType}
            data={item as OneBotConfig['network']['httpClients'][0]}
            onDelete={async () => {
              await onDelete('httpClients', item.name);
            }}
            onEdit={() => {
              onEdit('httpClients', item.name);
            }}
            onEnable={async () => {
              await onEnable('httpClients', item.name);
            }}
            onEnableDebug={async () => {
              await onEnableDebug('httpClients', item.name);
            }}
          />
        );
      case 'httpSseServers':
        return (
          <HTTPSSEServerDisplayCard
            key={item.name}
            showType={showType}
            data={item as OneBotConfig['network']['httpSseServers'][0]}
            onDelete={async () => {
              await onDelete('httpSseServers', item.name);
            }}
            onEdit={() => {
              onEdit('httpSseServers', item.name);
            }}
            onEnable={async () => {
              await onEnable('httpSseServers', item.name);
            }}
            onEnableDebug={async () => {
              await onEnableDebug('httpSseServers', item.name);
            }}
          />
        );
      case 'websocketServers':
        return (
          <WebsocketServerDisplayCard
            key={item.name}
            showType={showType}
            data={item as OneBotConfig['network']['websocketServers'][0]}
            onDelete={async () => {
              await onDelete('websocketServers', item.name);
            }}
            onEdit={() => {
              onEdit('websocketServers', item.name);
            }}
            onEnable={async () => {
              await onEnable('websocketServers', item.name);
            }}
            onEnableDebug={async () => {
              await onEnableDebug('websocketServers', item.name);
            }}
          />
        );
      case 'mcpServers':
        return (
          <McpServerDisplayCard
            key={item.name}
            showType={showType}
            data={item as OneBotConfig['network']['mcpServers'][0]}
            onDelete={async () => {
              await onDelete('mcpServers', item.name);
            }}
            onEdit={() => {
              onEdit('mcpServers', item.name);
            }}
            onEnable={async () => {
              await onEnable('mcpServers', item.name);
            }}
            onEnableDebug={async () => {
              await onEnableDebug('mcpServers', item.name);
            }}
          />
        );
      case 'milkyServers':
        return (
          <MilkyServerDisplayCard
            key={item.name}
            showType={showType}
            data={item as OneBotConfig['network']['milkyServers'][0]}
            onDelete={async () => {
              await onDelete('milkyServers', item.name);
            }}
            onEdit={() => {
              onEdit('milkyServers', item.name);
            }}
            onEnable={async () => {
              await onEnable('milkyServers', item.name);
            }}
            onEnableDebug={async () => {
              await onEnableDebug('milkyServers', item.name);
            }}
          />
        );
      case 'websocketClients':
        return (
          <WebsocketClientDisplayCard
            key={item.name}
            showType={showType}
            data={item as OneBotConfig['network']['websocketClients'][0]}
            onDelete={async () => {
              await onDelete('websocketClients', item.name);
            }}
            onEdit={() => {
              onEdit('websocketClients', item.name);
            }}
            onEnable={async () => {
              await onEnable('websocketClients', item.name);
            }}
            onEnableDebug={async () => {
              await onEnableDebug('websocketClients', item.name);
            }}
          />
        );
    }
  };

  const tabs = [
    {
      key: 'all',
      title: '全部',
      items: [
        ...httpServers,
        ...httpClients,
        ...websocketServers,
        ...websocketClients,
        ...httpSseServers,
        ...mcpServers,
        ...milkyServers,
      ]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((item) => {
          if (httpServers.find((i) => i.name === item.name)) {
            return renderCard(
              'httpServers',
              item as OneBotConfig['network']['httpServers'][0],
              true
            );
          }
          if (httpSseServers.find((i) => i.name === item.name)) {
            return renderCard(
              'httpSseServers',
              item as OneBotConfig['network']['httpSseServers'][0],
              true
            );
          }
          if (httpClients.find((i) => i.name === item.name)) {
            return renderCard(
              'httpClients',
              item as OneBotConfig['network']['httpClients'][0],
              true
            );
          }
          if (websocketServers.find((i) => i.name === item.name)) {
            return renderCard(
              'websocketServers',
              item as OneBotConfig['network']['websocketServers'][0],
              true
            );
          }
          if (websocketClients.find((i) => i.name === item.name)) {
            return renderCard(
              'websocketClients',
              item as OneBotConfig['network']['websocketClients'][0],
              true
            );
          }
          if (mcpServers.find((i) => i.name === item.name)) {
            return renderCard(
              'mcpServers',
              item as OneBotConfig['network']['mcpServers'][0],
              true
            );
          }
          if (milkyServers.find((i) => i.name === item.name)) {
            return renderCard(
              'milkyServers',
              item as OneBotConfig['network']['milkyServers'][0],
              true
            );
          }
          return null;
        }),
    },
    {
      key: 'milkyServers',
      title: 'Milky服务器',
      items: milkyServers.map((item) => renderCard('milkyServers', item)),
    },
    {
      key: 'mcpServers',
      title: 'MCP服务器',
      items: mcpServers.map((item) => renderCard('mcpServers', item)),
    },
    {
      key: 'httpServers',
      title: 'HTTP服务器',
      items: httpServers.map((item) => renderCard('httpServers', item)),
    },
    {
      key: 'httpClients',
      title: 'HTTP客户端',
      items: httpClients.map((item) => renderCard('httpClients', item)),
    },
    {
      key: 'httpSseServers',
      title: 'HTTP SSE服务器',
      items: httpSseServers.map((item) => renderCard('httpSseServers', item)),
    },
    {
      key: 'websocketServers',
      title: 'Websocket服务器',
      items: websocketServers.map((item) =>
        renderCard('websocketServers', item)
      ),
    },
    {
      key: 'websocketClients',
      title: 'Websocket客户端',
      items: websocketClients.map((item) =>
        renderCard('websocketClients', item)
      ),
    },
  ];

  useEffect(() => {
    refresh();
  }, []);

  return (
    <>
      <title>网络配置 - SnowCat WebUI</title>
      <div className='sc-page'>
        <NetworkFormModal
          data={activeData}
          field={activeField}
          isOpen={isOpen}
          onOpenChange={onOpenChange}
        />
        <PageLoading loading={loading} />
        <PageHeader
          icon={<LuSignal size={20} />}
          title='网络配置'
          description='WS / HTTP / SSE / MCP / Milky 接入点，一处统一管理'
          actions={
            <>
              <AddButton onOpen={handleClickCreate} />
              <Button
                isIconOnly
                className='bg-white/60 dark:bg-white/10 text-default-600 dark:text-default-300 backdrop-blur-md hover:bg-white/80 dark:hover:bg-white/20'
                radius='full'
                onPress={refresh}
              >
                <IoMdRefresh size={22} />
              </Button>
            </>
          }
        />
        <Tabs
          aria-label='Network Configs'
          className='max-w-full'
          items={tabs}
          classNames={{
            tabList: 'sc-tablist',
            cursor: 'sc-tab-cursor',
          }}
        >
          {(item) => (
            <Tab key={item.key} title={item.title}>
              <EmptySection isEmpty={!item.items.length} />
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 justify-start items-stretch gap-x-2 gap-y-4'>
                {item.items}
              </div>
            </Tab>
          )}
        </Tabs>
      </div>
    </>
  );
}
