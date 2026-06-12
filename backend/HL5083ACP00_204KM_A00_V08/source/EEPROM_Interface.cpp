#include "stdafx.h"
#include "EEPROM_Interface.h"

void EEPROM_Interface::init(){
	SERIAL{
		read.init(0,1,0,SITE);
		write.init(0,1,1,SITE);
		preview.init(0,1,2,SITE);
		testmode.init(0,1,3,SITE);
		MUX.init(0,4,7,SITE);
		EE_SEL.init(0,4,7,SITE);
	}
	clk_ch[0] = 0; // dio_0
	clk_ch[1] = 2; // dio_2
	sdi_ch[0] = 1; // dio_1
	sdi_ch[1] = 3; // dio_3
}
	
int EEPROM_Interface::get_bank(int reg){
	if(reg == 0)
		return 0;
	else if(reg == 1)
		return 2;
	else if(reg == 2)
		return 4;
	else if(reg == 3)
		return 6;
	else if(reg == 4)
		return 8;
	return 0;
}


void EEPROM_Interface::I2C_init(float clk_period, bool debug=1){
	if(debug){
	clk_ch[0] = 0; // dio_0
	clk_ch[1] = 2; // dio_2
	sdi_ch[0] = 1; // dio_1
	sdi_ch[1] = 3; // dio_3
	//I2CInitial();
	dio.Connect();
	dio.SetVIH(5);		//set driver high voltage
	dio.SetVIL(0);		//set driver low voltage
	dio.SetVOH(3.8f);	//set compare high voltage
	dio.SetVOL(1.5f);	//set compare low voltage
	dio.I2CSet(/*clk_period,*/sdi_ch[0],clk_ch[0],sdi_ch[1],clk_ch[1],-1,-1,-1,-1);		
	}
}

BOOL EEPROM_Interface::EEPROM_Read(const char* reg_str, int *EE_READ, double *EE_IQ){
	//if(strlen(reg_str) <= 0)
	//	return FALSE;
	//int reg = reg_str[strlen(reg_str) - 1] - '0';

	//I2CWriteData(I2C_ADDR_DEVICE, I2C_TM_INSTRUCTION, (get_bank(reg)<<4) + 1, (get_bank(reg)<<4) + 1);//read bit写1，配置对应bank
	//I2CReadData(I2C_ADDR_DEVICE, I2C_READ, 1);//通过read寄存器读出来
	//SERIAL EE_READ[SITE] = I2CGetReadData(SITE, 0);
	//
	//// measure EE_IQ
	//if((reg == 0) && (EE_IQ != NULL)){
	//	VBUS.Set(FV, 5, FOVI_10V, FOVI_10MA, RELAY_ON);
 //  		delay_ms(2);
	//	VBUS.MeasureVI(40, 10);
	//	SERIAL EE_IQ[SITE] = VBUS.GetMeasResult(SITE, MIRET) * 1e3;
	//	VBUS.Set(FV, 5, FOVI_10V, FOVI_100MA, RELAY_ON);
	//}

	return TRUE;
}

BOOL EEPROM_Interface::EEPROM_Burn(const char* reg_str, bool burn_flag[SITE_NUM]){
	//if(strlen(reg_str) <= 0)
	//	return FALSE;
	//int reg = reg_str[strlen(reg_str) - 1] - '0';

	//int working = dut.assy(reg_str).get_working(1);
	//int real_bank = get_bank(reg);

	////I2CWriteData(I2C_ADDR_DEVICE, I2C_TM_INSTRUCTION, 0x00, 0x00);
	//I2CWriteData(I2C_ADDR_DEVICE, I2C_PREVIEW, dut.assy(reg_str).get_working(0), dut.assy(reg_str).get_working(1));//preview寄存器写入需要preview的data
	//I2CWriteData(I2C_ADDR_DEVICE, I2C_TM_INSTRUCTION, (get_bank(reg)<<4) + 5, (get_bank(reg)<<4) + 5);//配置对应bank，把preview bit和read bit写1
	//I2CWriteData(I2C_ADDR_DEVICE, I2C_TM_INSTRUCTION, (get_bank(reg)<<4) + 2, (get_bank(reg)<<4) + 2);//配置对应bank，把write bit写1
 //	delay_ms(1);

	////test_method.watch_burn(nINT, FOVI_10V, FOVI_1A, 8.0, true);	// for NVM Check - Burn lab
	//SERIAL{
	//	BEGIN_SINGLE_SITE(SITE);
	//	//if(1)
	//		if(burn_flag[SITE])
	//	{
	//		nINT.Set(FV, 5, FOVI_10V, FOVI_1A, RELAY_ON);
	//		delay_ms(1);
	//		nINT.Set(FV, 8, FOVI_10V, FOVI_1A, RELAY_ON);
	//	} 

	//	END_SINGLE_SITE() 
	//}
	//delay_ms(20);	// do not change this delay for burn stable
	//nINT.Set(FV, 0, FOVI_10V, FOVI_100MA, RELAY_ON);
 //	delay_ms(1);

	return TRUE;
}

BOOL EEPROM_Interface::EEPROM_Preview(const char* reg_str){
	//if(strlen(reg_str) <= 0)
	//	return FALSE;
	//int reg = reg_str[strlen(reg_str) - 1] - '0';

	//dio.I2CWriteData(I2C_DEVICE_ADDR, I2C_TM_DATA, 0x82, 0x82);
	//dio.I2CWriteData(I2C_DEVICE_ADDR, I2C_PREVIEW, (WORD)(dut.assy(reg_str).get_working(0)), (WORD)(dut.assy(reg_str).get_working(1)));
	//dio.I2CWriteData(I2C_DEVICE_ADDR, I2C_TM_INSTRUCTION, (get_bank(reg)<<4) + 0x0D, (get_bank(reg)<<4) + 0x0D); 

	//if(strlen(reg_str) <= 0)
	//	return FALSE;
/////////////////////////////////////////////////
	int reg = 0;

	if (strlen(reg_str) > 0 && strlen(reg_str)<8)

		reg = reg_str[strlen(reg_str) - 1] - '0';

	else

	reg = (reg_str[strlen(reg_str) - 2] - '0') * 10 + (reg_str[strlen(reg_str) - 1] - '0');

     dio.I2CWriteData(I2C_DEVICE_ADDR, get_bank(reg), dut.assy(reg_str).get_working(0), dut.assy(reg_str).get_working(1), dut.assy(reg_str).get_working(2), dut.assy(reg_str).get_working(3), DIO::I2CByte1);


	return TRUE;
}

BOOL EEPROM_Interface::EEPROM_Preview(const char* reg_str, int instruction, int tm_data){
	if(strlen(reg_str) <= 0)
		return FALSE;
	int reg = reg_str[strlen(reg_str) - 1] - '0';

	// disable mux
	dio.I2CWriteData(I2C_DEVICE_ADDR, I2C_TM_DATA, tm_data & 0x7F, tm_data & 0x7F);//tm data寄存器最高位写0就是disable mux，写1就是enable mux

	//int a=0;
	//a=dut.assy(reg_str).get_working(1);
	// preview and select bank
	dio.I2CWriteData(I2C_DEVICE_ADDR, I2C_PREVIEW, (WORD)(dut.assy(reg_str).get_working(0)), (WORD)(dut.assy(reg_str).get_working(1)));//preview寄存器写入需要preview的data
	//I2CReadData(I2C_ADDR_DEVICE, I2C_PREVIEW, 1);//通过read寄存器读出来
	//int EE_READ[SITE_NUM];
	//SERIAL EE_READ[SITE] = I2CGetReadData(SITE, 0);
	dio.I2CWriteData(I2C_DEVICE_ADDR, I2C_TM_INSTRUCTION, (get_bank(reg)<<4) + 0x09, (get_bank(reg)<<4) + 0x09);//testmode\read bit写1 
	dio.I2CWriteData(I2C_DEVICE_ADDR, I2C_TM_INSTRUCTION, (get_bank(reg)<<4) + 0x0D, (get_bank(reg)<<4) + 0x0D);//testmode\read\preview bit写1 

	// enable mux
	dio.I2CWriteData(I2C_DEVICE_ADDR, I2C_TM_DATA, tm_data, tm_data);//tm data寄存器最高位写0就是disable mux，写1就是enable mux。低7位写入tm_data,每个mux可选多种tm_data
	dio.I2CWriteData(I2C_DEVICE_ADDR, I2C_TM_INSTRUCTION, instruction, instruction);//testmode bit 写1同时选择mux 
	//int rdata[SITE_NUM];
	//iic_read(0x00, rdata);

	return TRUE;
}

BOOL EEPROM_Interface::EEPROM_Enter_Test_Mode(int instruction, int tm_data){
	// disable mux
	dio.I2CWriteData(I2C_DEVICE_ADDR, I2C_TM_DATA, 0, 0);//tm data寄存器最高位写0就是disable mux，写1就是enable mux。低7位写入tm_data, 每个mux可选多种tm_data
	// enable mux
	dio.I2CWriteData(I2C_DEVICE_ADDR, I2C_TM_INSTRUCTION, instruction, instruction);//testmode bit 写1同时选择mux 
	dio.I2CWriteData(I2C_DEVICE_ADDR, I2C_TM_DATA, tm_data, tm_data); //tm data寄存器最高位写0就是disable mux，写1就是enable mux。低7位写入tm_data, 每个mux可选多种tm_data
	return TRUE;
}

void EEPROM_Interface::Run_15_cycle(float pat_delay)
{
	//dio.LoadPattern(0, "XXX00X00");  // reg byte
	//dio.LoadPattern(1, "XXX00X00");  // reg byte
	//dio.LoadPattern(2, "XXX00X00");  // reg byte
	//dio.LoadPattern(3, "XXX00X00");  // reg byte
	//dio.LoadPattern(4, "XXX00X00");  // reg byte
	//dio.LoadPattern(5, "XXX00X00");  // reg byte
	//dio.LoadPattern(6, "XXX00X00");  // reg byte
	//dio.LoadPattern(7, "XXX00X00");  // reg byte
	//dio.LoadPattern(8, "XXX00X00");  // reg byte
	//dio.LoadPattern(9, "XXX00X00");  // reg byte
	//dio.LoadPattern(10,"XXX00X00");  // reg byte
	//dio.LoadPattern(11, "XXX00X00");  // reg byte
	//dio.LoadPattern(12, "XXX00X00");  // reg byte
	//dio.LoadPattern(13, "XXX00X00");  // reg byte
	//dio.LoadPattern(14, "XXX00X00");  // reg byte
	//dio.LoadPattern(15, "XXX00X00");  // reg byte
	//dio.RunPattern(0,15);	
	//delay_us(DWORD(pat_delay));
}
