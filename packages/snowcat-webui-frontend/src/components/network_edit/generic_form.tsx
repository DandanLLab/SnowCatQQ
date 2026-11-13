import { Button } from '@heroui/button';
import { Input } from '@heroui/input';
import { ModalBody, ModalFooter } from '@heroui/modal';
import { Select, SelectItem } from '@heroui/select';
import { ReactElement, useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type {
  DefaultValues,
  Path,
  PathValue,
  SubmitHandler,
} from 'react-hook-form';
import toast from 'react-hot-toast';

import SwitchCard from '../switch_card';

export type FieldTypes = 'input' | 'select' | 'switch';

type NetworkConfigType = OneBotConfig['network'];

export interface Field<T extends keyof OneBotConfig['network']> {
  name: keyof NetworkConfigType[T][0];
  label: string;
  type: FieldTypes;
  options?: Array<{ key: string; value: string; }>;
  placeholder?: string;
  isRequired?: boolean;
  isDisabled?: boolean;
  description?: string;
  colSpan?: 1 | 2;
  /** 选中指定值时先弹确认，取消则不改变当前值 */
  warnOn?: Array<{ value: string; message: string; }>;
}

export interface GenericFormProps<T extends keyof NetworkConfigType> {
  data?: NetworkConfigType[T][0];
  defaultValues: DefaultValues<NetworkConfigType[T][0]>;
  onClose: () => void;
  onSubmit: (data: NetworkConfigType[T][0]) => Promise<void>;
  fields: Array<Field<T>>;
}

const GenericForm = <T extends keyof NetworkConfigType> ({
  data,
  defaultValues,
  onClose,
  onSubmit,
  fields,
}: GenericFormProps<T>): ReactElement => {
  const { control, handleSubmit, formState, setValue, reset } = useForm<
    NetworkConfigType[T][0]
  >({
    defaultValues,
  });

  const submitAction: SubmitHandler<NetworkConfigType[T][0]> = async (data) => {
    await onSubmit(data);
    onClose();
  };

  const _onSubmit = handleSubmit(submitAction, (e) => {
    const errors = Object.values(e);
    if (errors.length > 0) {
      toast.error(errors[0]?.message as string);
    }
  });

  useEffect(() => {
    if (data) {
      const keys = Object.keys(data) as Path<NetworkConfig[T][0]>[];
      for (const key of keys) {
        const value = data[key] as PathValue<
          NetworkConfig[T][0],
          Path<NetworkConfig[T][0]>
        >;
        setValue(key, value);
      }
      // 老后端 / 老配置文件可能没有 protocol 字段，这里补默认值，
      // 免得协议版本下拉框是空的、用户以为没得选
      const hasProtocolField = fields.some((f) => f.name === 'protocol');
      if (
        hasProtocolField &&
        (data as Record<string, unknown>)['protocol'] === undefined
      ) {
        setValue(
          'protocol' as Path<NetworkConfig[T][0]>,
          'v12' as unknown as PathValue<
            NetworkConfig[T][0],
            Path<NetworkConfig[T][0]>
          >
        );
      }
    } else {
      reset();
    }
  }, [data, reset, setValue]);

  return (
    <>
      <ModalBody>
        <div className='grid grid-cols-2 gap-y-4 gap-x-2 w-full'>
          {fields.map((field) => (
            <div
              key={field.name as string}
              className={field.colSpan === 1 ? 'col-span-1' : 'col-span-2'}
            >
              <Controller
                control={control}
                name={field.name as Path<NetworkConfig[T][0]>}
                rules={
                  field.isRequired
                    ? {
                      required: `请填写${field.label}`,
                    }
                    : undefined
                }
                render={({ field: controllerField }) => {
                  switch (field.type) {
                    case 'input':
                      return (
                        <Input
                          value={controllerField.value as string}
                          onValueChange={(value) => controllerField.onChange(value)}
                          ref={controllerField.ref}
                          isRequired={field.isRequired}
                          isDisabled={field.isDisabled}
                          label={field.label}
                          placeholder={field.placeholder}
                          classNames={{
                            inputWrapper:
                              'bg-white/80 dark:bg-white/[0.06] backdrop-blur-md border border-black/[0.08] dark:border-white/12 hover:bg-white/95 dark:hover:bg-white/[0.09] transition-all shadow-sm data-[hover=true]:border-primary/35 group-data-[focus=true]:border-primary/55',
                            input: 'bg-transparent text-default-700 dark:text-default-100 placeholder:text-default-400',
                          }}
                        />
                      );
                    case 'select':
                      return (
                        <Select
                          {...controllerField}
                          ref={controllerField.ref}
                          isRequired={field.isRequired}
                          label={field.label}
                          placeholder={field.placeholder}
                          selectedKeys={[controllerField.value as string]}
                          value={controllerField.value.toString()}
                          onSelectionChange={(key) => {
                            const next = key === null ? '' : String(key);
                            const warning = field.warnOn?.find(
                              (item) => item.value === next
                            );
                            if (
                              warning &&
                              !window.confirm(warning.message)
                            ) {
                              return;
                            }
                            controllerField.onChange(next);
                          }}
                          classNames={{
                            trigger: 'bg-white/80 dark:bg-white/[0.06] backdrop-blur-md border border-black/[0.08] dark:border-white/12 hover:bg-white/95 dark:hover:bg-white/[0.09] transition-all shadow-sm data-[hover=true]:border-primary/35',
                            value: 'text-default-700 dark:text-default-100',
                          }}
                        >
                          {field.options?.map((option) => (
                            <SelectItem key={option.key} value={option.value}>
                              {option.value}
                            </SelectItem>
                          )) || <></>}
                        </Select>
                      );
                    case 'switch':
                      return (
                        <SwitchCard
                          {...controllerField}
                          value={controllerField.value as boolean}
                          description={field.description}
                          label={field.label}
                        />
                      );
                    default:
                      return <></>;
                  }
                }}
              />
            </div>
          ))}
        </div>
      </ModalBody>
      <ModalFooter className='border-t border-white/50 dark:border-white/[0.06] pt-3'>
        <Button
          color='default'
          isDisabled={formState.isSubmitting}
          variant='flat'
          radius='full'
          className='bg-white/60 dark:bg-white/[0.06] text-default-600'
          onPress={onClose}
        >
          取消
        </Button>
        <Button
          color='primary'
          radius='full'
          isLoading={formState.isSubmitting}
          className='font-semibold bg-gradient-to-r from-primary-400 to-primary-600 shadow-md shadow-primary-500/25 px-6'
          onPress={() => _onSubmit()}
        >
          保存
        </Button>
      </ModalFooter>
    </>
  );
};

export default GenericForm;
export function random_token (length: number) {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.~';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
