import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Product from '@modules/products/infra/typeorm/entities/Product';
import IUpdateProductsQuantityDTO from '@modules/products/dtos/IUpdateProductsQuantityDTO';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}
interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customerExist = await this.customersRepository.findById(customer_id);

    if (!customerExist) {
      throw new AppError('Customer not found.', 400);
    }

    const productsIds = products.map(product => ({ id: product.id }));

    const findProducts = await this.productsRepository.findAllById(productsIds);

    if (products.length !== findProducts.length) {
      throw new AppError('One or more products not found.', 400);
    }

    const productsQuantityToUpdate: IUpdateProductsQuantityDTO[] = [];
    const productsWithoutStock: Product[] = [];
    const productsToUpdate: Product[] = [];

    findProducts.forEach(findProduct => {
      const orderProduct = products.find(
        product => product.id === findProduct.id,
      );

      if (orderProduct) {
        if (findProduct.quantity - orderProduct.quantity < 0) {
          productsWithoutStock.push(findProduct);
        } else {
          productsQuantityToUpdate.push({
            id: orderProduct.id,
            quantity: findProduct.quantity - orderProduct.quantity,
          });

          productsToUpdate.push({
            ...findProduct,
            quantity: orderProduct.quantity,
          });
        }
      }
    });

    if (productsWithoutStock.length !== 0) {
      throw new AppError(
        `${productsWithoutStock.length} products with stock not found.`,
        400,
      );
    }

    await this.productsRepository.updateQuantity(productsQuantityToUpdate);

    const order = await this.ordersRepository.create({
      customer: customerExist,
      products: productsToUpdate.map(product => ({
        product_id: product.id,
        price: product.price,
        quantity: product.quantity,
      })),
    });

    return order;
  }
}

export default CreateOrderService;
