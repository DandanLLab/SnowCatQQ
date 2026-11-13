import { Chip } from '@heroui/chip';

import NetworkDisplayCard from './common_card';
import type { NetworkDisplayCardFields } from './common_card';

interface MilkyServerDisplayCardProps {
  data: OneBotConfig['network']['milkyServers'][0];
  showType?: boolean;
  onEdit: () => void;
  onEnable: () => Promise<void>;
  onDelete: () => Promise<void>;
  onEnableDebug: () => Promise<void>;
}

const MilkyServerDisplayCard: React.FC<MilkyServerDisplayCardProps> = (
  props
) => {
  const { data, showType, onEdit, onEnable, onDelete, onEnableDebug } = props;
  const { host, port, token } = data;

  const fields: NetworkDisplayCardFields<'milkyServers'> = [
    { label: '主机', value: host },
    { label: '端口', value: port },
    { label: '端点', value: `/api, /event` },
    {
      label: '鉴权',
      value: !!token,
      render: (value) => (
        <Chip color={value ? 'success' : 'warning'} size='sm' variant='flat'>
          {value ? 'Bearer Token' : '未鉴权'}
        </Chip>
      ),
    },
  ];

  return (
    <NetworkDisplayCard
      data={data}
      showType={showType}
      typeLabel='Milky服务器'
      fields={fields}
      onEdit={onEdit}
      onEnable={onEnable}
      onDelete={onDelete}
      onEnableDebug={onEnableDebug}
    />
  );
};

export default MilkyServerDisplayCard;
